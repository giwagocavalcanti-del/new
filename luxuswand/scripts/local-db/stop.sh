#!/bin/bash
# Stops the local database stack started by start.sh. Data is kept.
DIR="$(cd "$(dirname "$0")" && pwd)"
DATA="$(cd "$DIR/../.." && pwd)/.local-db"
PG_BIN="$(brew --prefix postgresql@17)/bin"

for name in gateway postgrest; do
  if [ -f "$DATA/$name.pid" ]; then
    kill "$(cat "$DATA/$name.pid")" 2>/dev/null || true
    rm -f "$DATA/$name.pid"
  fi
done

if [ -d "$DATA/pg" ]; then
  "$PG_BIN/pg_ctl" -D "$DATA/pg" -m fast stop >/dev/null 2>&1 || true
fi
echo "Local database stopped."
