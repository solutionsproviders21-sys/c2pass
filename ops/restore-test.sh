#!/bin/bash
# Monthly restore test (cahier des charges §7): restores the latest backup into throwaway containers, never into the
# live databases, and checks that the data is there. Installed as a monthly cron by ops/install.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=${1:-./backups}
env_value() { [ -f .env ] && grep "^$1=" .env | head -1 | cut -d= -f2- || true; }
PASSPHRASE=${BACKUP_PASSPHRASE:-$(env_value BACKUP_PASSPHRASE)}
SRC=$(ls -d "$DEST"/20* 2>/dev/null | sort | tail -1)
[ -n "$SRC" ] || { echo "ÉCHEC du test de restauration : aucune sauvegarde dans $DEST" >&2; exit 1; }
read_backup() {
  if [ -f "$1.enc" ]; then BACKUP_PASSPHRASE="$PASSPHRASE" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$1.enc"
  else cat "$1"; fi
}
PG=c2pass-restore-test-pg; MG=c2pass-restore-test-mongo
cleanup() { docker rm -f "$PG" "$MG" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$PG" -e POSTGRES_USER=c2pass -e POSTGRES_PASSWORD=test -e POSTGRES_DB=c2pass_tcf postgres:16-alpine >/dev/null
docker run -d --name "$MG" mongo:7 >/dev/null
for _ in $(seq 60); do docker exec "$PG" pg_isready -U c2pass -d c2pass_tcf >/dev/null 2>&1 && docker exec "$MG" mongosh --quiet --eval 1 >/dev/null 2>&1 && break; sleep 2; done
sleep 2
read_backup "$SRC/postgres.dump" | docker exec -i "$PG" pg_restore -U c2pass -d c2pass_tcf --no-owner
read_backup "$SRC/mongo.archive.gz" | docker exec -i "$MG" mongorestore --quiet --archive --gzip
MONGO_DB=${MONGO_DB:-$(env_value MONGO_DB)}
MIGRATIONS=$(docker exec "$PG" psql -tA -U c2pass -d c2pass_tcf -c 'SELECT count(*) FROM schema_migrations')
USERS=$(docker exec "$PG" psql -tA -U c2pass -d c2pass_tcf -c 'SELECT count(*) FROM users')
QUESTIONS=$(docker exec "$MG" mongosh --quiet "${MONGO_DB:-c2pass}" --eval 'db.questions.countDocuments()')
# The file archive must decrypt and read to the end.
FILES=$(read_backup "$SRC/files.tar.gz" | tar tzf - | wc -l)
[ "$MIGRATIONS" -gt 0 ] && [ "$QUESTIONS" -gt 0 ] || { echo "ÉCHEC du test de restauration de $SRC : $MIGRATIONS migrations, $QUESTIONS questions" >&2; exit 1; }
echo "$(date -u +%FT%TZ) test de restauration OK : $SRC, $USERS comptes, $QUESTIONS questions, $FILES fichiers"
