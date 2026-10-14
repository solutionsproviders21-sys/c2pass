#!/bin/sh
# Restores a backup made by ops/backup.sh. REPLACES the current data: stop the site first (docker compose stop api web).
# Usage: ops/restore.sh backups/postgres-YYYYMMDD-HHMMSS.dump backups/mongo-YYYYMMDD-HHMMSS.archive.gz
set -eu
PG=$1
MONGO=$2
COMPOSE=${COMPOSE:-docker compose}
$COMPOSE exec -T postgres pg_restore -U c2pass -d c2pass_tcf --clean --if-exists --no-owner < "$PG"
$COMPOSE exec -T mongo mongorestore --quiet --archive --gzip --drop < "$MONGO"
echo "Restauration terminée. Relancez : $COMPOSE start api web"
