# Plotline

Plan work on a timeline chart and track it on a checklist. Your plan is two plain CSV files, and you can edit them inside the app.

## Start it (needs Docker only)

    ./up       # build and start, then open http://localhost:8080
    ./down     # stop (your data is kept)
    ./clean    # stop and remove the built image (your data is kept)

`make up`, `make down` and `make clean` do the same. On Windows use `docker compose up -d --build` and `docker compose down`.

## Use it

Open the **Start here** tab. It shows where you are, what to do next, and what each tab does.

| Tab | What it is for |
|---|---|
| Start here | Status, the next step, a three-step guide, clear or restore the example |
| Timeline | Chart of phases, tasks and milestones. Click a bar for details |
| Checklist | Tick items off; the date is saved |
| Edit timeline | Table to add, change, move, copy and delete timeline rows |
| Edit checklist | The same for checklist items |

Edit tabs check your entries as you go, explain problems in plain words, and save only when you press **Save changes**. Each save keeps the previous file in `data/backups` (last 20 per file). **Start here** can clear the example or bring it back; both ask first and keep a backup.

## The data files (in `data/`)

`timeline.csv`: `type, group, name, owner, start, end, notes`
- `type` is `phase`, `task` or `milestone`. A milestone is one date, so leave `end` empty.
- Dates are `yyyy-mm-dd`, for example `2026-11-02`.
- Rows with the same `group` share a color and a line.

`checklist.csv`: `group, item, owner, due, notes, done`
- `done` holds the date finished; empty means not done.
- Use the same `group` names as the timeline and the Checklist page shows each group's dates.

Wrap text in double quotes if it contains a comma. Other columns are ignored (and dropped on the next save; the backup keeps them). You can edit the files in a spreadsheet app and switch tabs in Plotline to see the changes, but spreadsheets sometimes rewrite dates, so the edit tabs are safer.

## Without Docker

Needs Go 1.22+ and Node 20+.

    cd frontend && npm install && npm run build && cd ..
    cd backend && DATA_DIR=../data STATIC_DIR=../frontend/dist go run .
