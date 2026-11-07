#!/bin/bash
# Copies the non-empty values of ops/site.env into .env, and derives the public URLs from DOMAIN.
# Called by ops/install.sh and ops/update.sh, from the installation folder.
set -euo pipefail
[ -f .env ] || exit 0
setenv() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$(printf '%s' "$2" | sed 's/[|&\\]/\\&/g')|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }
if [ -f ops/site.env ]; then
  while IFS='=' read -r key value; do
    case "$key" in ''|\#*) continue;; esac
    [ -n "$value" ] && setenv "$key" "$value"
  done < ops/site.env
fi
DOMAIN=$(grep '^DOMAIN=' .env | head -1 | cut -d= -f2-)
if [ -n "$DOMAIN" ]; then
  setenv PUBLIC_WEB_URL "https://$DOMAIN"
  setenv API_PUBLIC_URL "https://$DOMAIN"
  setenv CORS_ORIGINS "https://$DOMAIN"
fi
