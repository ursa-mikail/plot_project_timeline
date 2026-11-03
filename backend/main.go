// Plotline server.
//
// It is deliberately small: it reads and writes two CSV files (timeline.csv and
// checklist.csv), keeps a backup of the previous version on every save, and
// serves the web app. All checking of the data happens in the browser, so the
// person editing always sees problems in plain language next to the cell.
package main

import (
	"bytes"
	"embed"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed samples/*.csv
var samples embed.FS

// The columns Plotline uses. Any other column in a file is ignored (and reported).
var schema = map[string][]string{
	"timeline":  {"type", "group", "name", "owner", "start", "end", "notes"},
	"checklist": {"group", "item", "owner", "due", "notes", "done"},
}

const keepBackups = 20

var (
	mu      sync.Mutex
	dataDir string
)

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func path(kind string) string { return filepath.Join(dataDir, kind+".csv") }

type Row = map[string]string

// ---------- reading and writing ----------

func readFile(kind string) (header []string, recs [][]string, err error) {
	b, err := os.ReadFile(path(kind))
	if err != nil {
		return nil, nil, err
	}
	b = bytes.TrimPrefix(b, []byte("\xef\xbb\xbf")) // Excel adds a byte-order mark
	r := csv.NewReader(bytes.NewReader(b))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	all, err := r.ReadAll()
	if err != nil {
		return nil, nil, err
	}
	if len(all) == 0 {
		return nil, nil, nil
	}
	return all[0], all[1:], nil
}

// load returns every non-blank row as a map of known columns, plus the names of
// any columns in the file that Plotline does not use.
func load(kind string) (rows []Row, ignored []string, err error) {
	cols := schema[kind]
	ignored = []string{}
	header, recs, err := readFile(kind)
	if err != nil {
		return nil, nil, err
	}
	pos := map[string]int{}
	for i, h := range header {
		h = strings.ToLower(strings.TrimSpace(h))
		if h == "" {
			continue
		}
		known := false
		for _, c := range cols {
			if c == h {
				known = true
			}
		}
		if known {
			pos[h] = i
		} else {
			ignored = append(ignored, h)
		}
	}
	rows = []Row{}
	for _, rec := range recs {
		row := Row{}
		blank := true
		for _, c := range cols {
			v := ""
			if i, ok := pos[c]; ok && i < len(rec) {
				v = strings.TrimSpace(rec[i])
			}
			if v != "" {
				blank = false
			}
			row[c] = v
		}
		if !blank {
			rows = append(rows, row)
		}
	}
	return rows, ignored, nil
}

func encode(w io.Writer, kind string, rows []Row) error {
	cols := schema[kind]
	cw := csv.NewWriter(w)
	if err := cw.Write(cols); err != nil {
		return err
	}
	for _, row := range rows {
		rec := make([]string, len(cols))
		for i, c := range cols {
			rec[i] = strings.TrimSpace(row[c])
		}
		if err := cw.Write(rec); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

// save writes the file atomically. When backup is true the previous version is
// copied to data/backups first, and the oldest backups are removed.
func save(kind string, rows []Row, backup bool) (string, error) {
	var buf bytes.Buffer
	buf.WriteString("\xef\xbb\xbf")
	if err := encode(&buf, kind, rows); err != nil {
		return "", err
	}
	return saveBytes(kind, buf.Bytes(), backup)
}

func saveBytes(kind string, data []byte, backup bool) (string, error) {
	backupName := ""
	if old, err := os.ReadFile(path(kind)); err == nil && backup {
		dir := filepath.Join(dataDir, "backups")
		if err := os.MkdirAll(dir, 0o755); err == nil {
			backupName = fmt.Sprintf("%s-%s.csv", kind, time.Now().Format("20060102-150405"))
			if err := os.WriteFile(filepath.Join(dir, backupName), old, 0o644); err != nil {
				backupName = ""
			}
			prune(dir, kind)
		}
	}
	tmp := path(kind) + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, path(kind)); err != nil {
		return "", err
	}
	return backupName, nil
}

func prune(dir, kind string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	var names []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), kind+"-") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for len(names) > keepBackups {
		os.Remove(filepath.Join(dir, names[0]))
		names = names[1:]
	}
}

// seed makes sure both files exist. A first run starts with the example plan.
func seed() error {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	for kind := range schema {
		if _, err := os.Stat(path(kind)); errors.Is(err, os.ErrNotExist) {
			b, _ := samples.ReadFile("samples/" + kind + ".csv")
			if _, err := saveBytes(kind, b, false); err != nil {
				return err
			}
		}
	}
	return nil
}

// ---------- HTTP ----------

func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	reply(w, status, map[string]string{"error": msg})
}

func kindOf(w http.ResponseWriter, r *http.Request) (string, bool) {
	k := r.PathValue("kind")
	if _, ok := schema[k]; !ok {
		fail(w, http.StatusNotFound, "Unknown data set. Use timeline or checklist.")
		return "", false
	}
	return k, true
}

func main() {
	dataDir = env("DATA_DIR", "data")
	static := env("STATIC_DIR", "static")
	if err := seed(); err != nil {
		log.Fatalf("Cannot use the data folder %q: %v", dataDir, err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/data/{kind}", func(w http.ResponseWriter, r *http.Request) {
		kind, ok := kindOf(w, r)
		if !ok {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		rows, ignored, err := load(kind)
		if err != nil {
			fail(w, 500, fmt.Sprintf("%s.csv could not be read: %v. Open the file and check for a missing quote mark, or restore a copy from data/backups.", kind, err))
			return
		}
		reply(w, 200, map[string]any{"columns": schema[kind], "rows": rows, "ignored": ignored})
	})

	mux.HandleFunc("PUT /api/data/{kind}", func(w http.ResponseWriter, r *http.Request) {
		kind, ok := kindOf(w, r)
		if !ok {
			return
		}
		var in struct {
			Rows []Row `json:"rows"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20)).Decode(&in); err != nil {
			fail(w, 400, "The changes could not be read. Reload the page and try again.")
			return
		}
		mu.Lock()
		defer mu.Unlock()
		backup, err := save(kind, in.Rows, true)
		if err != nil {
			fail(w, 500, "The file could not be saved: "+err.Error())
			return
		}
		reply(w, 200, map[string]any{"ok": true, "backup": backup, "rows": len(in.Rows)})
	})

	// Tick or untick one checklist item. The item text is sent too, so a stale
	// page can never change the wrong row.
	mux.HandleFunc("POST /api/checklist/toggle", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Index int    `json:"index"`
			Item  string `json:"item"`
			Done  bool   `json:"done"`
			Date  string `json:"date"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
			fail(w, 400, "That change could not be read.")
			return
		}
		mu.Lock()
		defer mu.Unlock()
		rows, _, err := load("checklist")
		if err != nil {
			fail(w, 500, "checklist.csv could not be read: "+err.Error())
			return
		}
		if in.Index < 0 || in.Index >= len(rows) || rows[in.Index]["item"] != strings.TrimSpace(in.Item) {
			fail(w, 409, "The checklist changed since this page loaded. Reload the page to see the latest version.")
			return
		}
		if in.Done {
			d := in.Date
			if _, err := time.Parse("2006-01-02", d); err != nil {
				d = time.Now().Format("2006-01-02")
			}
			rows[in.Index]["done"] = d
		} else {
			rows[in.Index]["done"] = ""
		}
		if _, err := save("checklist", rows, false); err != nil {
			fail(w, 500, "The change could not be saved: "+err.Error())
			return
		}
		reply(w, 200, map[string]any{"ok": true})
	})

	// Replace the data with the example plan, or with empty files.
	mux.HandleFunc("POST /api/reset", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Mode string `json:"mode"` // "example" or "blank"
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&in); err != nil || (in.Mode != "example" && in.Mode != "blank") {
			fail(w, 400, "Choose example or blank.")
			return
		}
		mu.Lock()
		defer mu.Unlock()
		for kind, cols := range schema {
			var b []byte
			if in.Mode == "example" {
				b, _ = samples.ReadFile("samples/" + kind + ".csv")
			} else {
				b = []byte(strings.Join(cols, ",") + "\n")
			}
			if _, err := saveBytes(kind, b, true); err != nil {
				fail(w, 500, "Could not replace "+kind+".csv: "+err.Error())
				return
			}
		}
		reply(w, 200, map[string]any{"ok": true})
	})

	mux.HandleFunc("GET /api/download/{file}", func(w http.ResponseWriter, r *http.Request) {
		kind := strings.TrimSuffix(r.PathValue("file"), ".csv")
		if _, ok := schema[kind]; !ok {
			fail(w, 404, "Unknown file.")
			return
		}
		mu.Lock()
		defer mu.Unlock()
		rows, _, err := load(kind)
		if err != nil {
			fail(w, 500, err.Error())
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+kind+`.csv"`)
		w.Write([]byte("\xef\xbb\xbf"))
		encode(w, kind, rows)
	})

	mux.Handle("/", http.FileServer(http.Dir(static)))

	addr := ":" + env("PORT", "8080")
	log.Printf("Plotline is running on http://localhost%s (data folder: %s)", addr, dataDir)
	log.Fatal(http.ListenAndServe(addr, mux))
}
