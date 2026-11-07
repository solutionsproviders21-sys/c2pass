#!/bin/bash
# Pulls the latest code from GitHub and rebuilds the services that changed. Installed by ops/install.sh as a
# systemd timer (every 10 minutes): a push to the main branch reaches the server on its own.
# The server keeps no changes of its own: .env and backups/ are not tracked by git and are left untouched.
set -euo pipefail
DIR=${DIR:-/opt/c2pass}
BRANCH=${BRANCH:-main}
cd "$DIR"
exec 9>/run/c2pass-update.lock
flock -n 9 || exit 0   # a previous update is still building

git fetch -q origin "$BRANCH"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ] && exit 0

echo "$(date -u +%FT%TZ) mise à jour $(git rev-parse --short HEAD) → $(git rev-parse --short "origin/$BRANCH")"
git reset -q --hard "origin/$BRANCH"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
docker image prune -f >/dev/null
