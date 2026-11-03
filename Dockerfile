FROM node:20-alpine AS web
WORKDIR /w
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM golang:1.22-alpine AS api
WORKDIR /b
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /server .

FROM alpine:3.20
WORKDIR /app
COPY --from=api /server /app/server
COPY --from=web /w/dist /app/static
ENV DATA_DIR=/app/data STATIC_DIR=/app/static PORT=8080
EXPOSE 8080
CMD ["/app/server"]
