#!/bin/bash
# Restores a backup folder made by ops/backup.sh. REPLACES the current data.
# Usage, from the installation folder: ops/restore.sh backups/YYYYMMDD-HHMMSS
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=${1:?Usage : ops/restore.sh backups/AAAAMMJJ-HHMMSS}
COMPOSE=${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}
env_value() { [ -f .env ] && grep "^$1=" .env | head -1 | cut -d= -f2- || true; }
PASSPHRASE=${BACKUP_PASSPHRASE:-$(env_value BACKUP_PASSPHRASE)}

# Writes the (decrypted) content of a backup file to stdout.
read_backup() {
  if [ -f "$1.enc" ]; then BACKUP_PASSPHRASE="$PASSPHRASE" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$1.enc"
  else cat "$1"; fi
}

$COMPOSE stop api web
read_backup "$SRC/postgres.dump" | $COMPOSE exec -T postgres pg_restore -U c2pass -d c2pass_tcf --clean --if-exists --no-owner
read_backup "$SRC/mongo.archive.gz" | $COMPOSE exec -T mongo mongorestore --quiet --archive --gzip --drop
if [ -f "$SRC/files.tar.gz" ] || [ -f "$SRC/files.tar.gz.enc" ]; then
  read_backup "$SRC/files.tar.gz" | $COMPOSE exec -T s3 tar xzf - -C /data
  $COMPOSE restart s3
fi
$COMPOSE start api web
echo "Restauration terminée depuis $SRC."
