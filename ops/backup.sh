#!/bin/sh
# Daily backup of the C2Pass databases (PostgreSQL: accounts, payments, sessions; MongoDB: questions, copies).
# Usage, from the repository folder:   ops/backup.sh [destination]      (default: ./backups)
# Cron example (every night at 2:30):   30 2 * * * cd /srv/c2pass && ops/backup.sh >> backups/backup.log 2>&1
# Copy the destination folder off the server (another machine or object storage): a backup on the same disk
# does not survive the loss of that disk. Keep VAULT_KEY with it, or the candidate vaults cannot be read back.
set -eu
DEST=${1:-./backups}
KEEP_DAYS=${KEEP_DAYS:-14}
COMPOSE=${COMPOSE:-docker compose}
STAMP=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$DEST"

$COMPOSE exec -T postgres pg_dump -U c2pass -d c2pass_tcf --format=custom --no-owner > "$DEST/postgres-$STAMP.dump"
$COMPOSE exec -T mongo mongodump --quiet --archive --gzip --db="${MONGO_DB:-c2pass}" > "$DEST/mongo-$STAMP.archive.gz"

# A dump that is suspiciously small means the command failed half-way: say so loudly.
for f in "$DEST/postgres-$STAMP.dump" "$DEST/mongo-$STAMP.archive.gz"; do
  [ "$(wc -c < "$f")" -gt 1000 ] || { echo "ÉCHEC : sauvegarde vide ou incomplète : $f" >&2; exit 1; }
done

find "$DEST" -name 'postgres-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$DEST" -name 'mongo-*.archive.gz' -mtime +"$KEEP_DAYS" -delete
echo "Sauvegarde OK : $DEST/postgres-$STAMP.dump, $DEST/mongo-$STAMP.archive.gz"
