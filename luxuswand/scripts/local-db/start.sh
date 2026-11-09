#!/bin/bash
# Starts a local copy of the database for tests: Postgres with the project's
# migrations, PostgREST and a small gateway that answers like the Supabase API.
# Data lives in .local-db (git-ignored); delete that folder to start empty.
# Requires: brew install postgresql@17 postgrest
set -euo pipefail
# Without a valid locale Postgres refuses to start on macOS.
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
DATA="$ROOT/.local-db"
PG_BIN="$(brew --prefix postgresql@17)/bin"
PG_PORT=54429
REST_PORT=54431
API_PORT=54421
# Not a secret: it only signs tokens for this local test stack.
JWT_SECRET="local-test-only-jwt-secret-0123456789abcdef"
DB="postgres://postgres@127.0.0.1:$PG_PORT/shop"

bash "$DIR/stop.sh" >/dev/null 2>&1 || true
mkdir -p "$DATA"

if [ ! -d "$DATA/pg" ]; then
  "$PG_BIN/initdb" -D "$DATA/pg" -U postgres --auth=trust -E UTF8 --locale=en_US.UTF-8 >/dev/null
fi
"$PG_BIN/pg_ctl" -D "$DATA/pg" -o "-p $PG_PORT -c listen_addresses=127.0.0.1" -l "$DATA/postgres.log" -w start >/dev/null

if ! "$PG_BIN/psql" -X -At "postgres://postgres@127.0.0.1:$PG_PORT/postgres" -c "select 1 from pg_database where datname = 'shop'" | grep -q 1; then
  "$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U postgres shop
  "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 "$DB" -f "$DIR/bootstrap.sql"
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 "$DB" -f "$migration"
  done
fi

PGRST_DB_URI="postgres://authenticator:local-authenticator@127.0.0.1:$PG_PORT/shop" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT="$REST_PORT" \
  nohup postgrest >"$DATA/postgrest.log" 2>&1 &
echo $! >"$DATA/postgrest.pid"

API_PORT="$API_PORT" REST_URL="http://127.0.0.1:$REST_PORT" \
  nohup node "$DIR/gateway.mjs" >"$DATA/gateway.log" 2>&1 &
echo $! >"$DATA/gateway.pid"

# The keys the app would get from Supabase: tokens for the server role and the browser role.
JWT_SECRET="$JWT_SECRET" API_PORT="$API_PORT" DATABASE_URL="$DB" node -e '
  const { createHmac } = require("node:crypto");
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = (role) => {
    const body = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role, iss: "local", exp: 4102444800 });
    return body + "." + createHmac("sha256", process.env.JWT_SECRET).update(body).digest("base64url");
  };
  const env = {
    url: "http://127.0.0.1:" + process.env.API_PORT,
    secretKey: token("service_role"),
    anonKey: token("anon"),
    databaseUrl: process.env.DATABASE_URL,
  };
  require("node:fs").writeFileSync(process.argv[1], JSON.stringify(env, null, 2) + "\n");
' "$DATA/env.json"

echo "Local database up: API http://127.0.0.1:$API_PORT · Postgres 127.0.0.1:$PG_PORT · details in .local-db/env.json"
