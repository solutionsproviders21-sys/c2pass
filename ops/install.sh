#!/bin/bash
# Installs C2Pass on a fresh Ubuntu 24.04 / Debian 12 server (4 GB RAM or more) and keeps it up to date.
#
# Two ways to run it, as root:
#   1. Paste this whole file into the "User data" / "Cloud config" box when creating the server
#      (Hetzner, DigitalOcean, Vultr, OVH, Scaleway...), after filling in the variables below.
#   2. Or on the server:  curl -fsSL https://raw.githubusercontent.com/solutionsproviders21-sys/c2pass/main/ops/install.sh -o install.sh
#                         ADMIN_EMAIL=vous@exemple.com ADMIN_PASSWORD='...' bash install.sh
#
# The site is then online at https://<DOMAIN>. Without DOMAIN, it uses a free address built from the server IP
# (https://1-2-3-4.sslip.io) until a real domain points to the server. Progress: /var/log/c2pass-install.log.
# Running it again is safe: secrets already in /opt/c2pass/.env are kept.

# ---- À remplir (or pass as environment variables) ----
ADMIN_EMAIL=${ADMIN_EMAIL:-}            # e-mail of the first administrator
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}      # 12 characters or more; empty = random password written to the log
ADMIN_FIRST_NAME=${ADMIN_FIRST_NAME:-Admin}
ADMIN_LAST_NAME=${ADMIN_LAST_NAME:-C2Pass}
DOMAIN=${DOMAIN:-}                      # e.g. c2pass.cm (DNS A record → this server); empty = <ip>.sslip.io
SMTP_URL=${SMTP_URL:-}                  # e.g. smtps://user:pass@smtp-relay.brevo.com:465 ; empty = e-mails only logged
MAIL_FROM=${MAIL_FROM:-}
# ------------------------------------------------------
REPO=${REPO:-https://github.com/solutionsproviders21-sys/c2pass}
BRANCH=${BRANCH:-main}
DIR=${DIR:-/opt/c2pass}

set -euo pipefail
exec > >(tee -a /var/log/c2pass-install.log) 2>&1
echo "== C2Pass : installation $(date -u +%FT%TZ)"
[ "$(id -u)" = 0 ] || { echo "À lancer en root (sudo)." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

# 1. System packages and Docker
apt-get update -q
apt-get install -yq ca-certificates curl git openssl
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
[ -d /run/systemd/system ] && systemctl enable --now docker

# 2. Swap: building the site needs more memory than running it
if ! swapon --show 2>/dev/null | grep -q . && [ ! -f /swapfile ]; then
  { fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile \
    && echo '/swapfile none swap sw 0 0' >> /etc/fstab; } || echo "Swap non créé (continuer sans)."
fi

# 3. Code
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" reset -q --hard "origin/$BRANCH"
else git clone -q --branch "$BRANCH" "$REPO" "$DIR"; fi
cd "$DIR"

# 4. Configuration (.env), generated once with fresh secrets
setenv() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$(printf '%s' "$2" | sed 's/[|&\\]/\\&/g')|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }
getenv() { grep "^$1=" .env | head -1 | cut -d= -f2-; }
FIRST_INSTALL=0
if [ ! -f .env ]; then
  FIRST_INSTALL=1
  cp .env.example .env && chmod 600 .env
  setenv JWT_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
  setenv VAULT_KEY "$(openssl rand -base64 32 | tr -d '\n')"
  setenv POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  setenv S3_SECRET_ACCESS_KEY "$(openssl rand -hex 24)"
  setenv S3_SSE_KEY "$(openssl rand -hex 32)"
  setenv PAYMENTS_WEBHOOK_SECRET "$(openssl rand -hex 24)"
  setenv PAYMENTS_MODE live
  setenv ALLOW_SANDBOX_PAYMENTS false
  setenv SEED_DEMO_ACCOUNTS false
fi
if [ -z "$DOMAIN" ]; then
  DOMAIN=$(getenv DOMAIN)
  case "$DOMAIN" in ""|c2pass.cm) IP=$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}'); DOMAIN="${IP//./-}.sslip.io";; esac
fi
setenv NODE_ENV production
setenv DOMAIN "$DOMAIN"
setenv PUBLIC_WEB_URL "https://$DOMAIN"
setenv API_PUBLIC_URL "https://$DOMAIN"
setenv CORS_ORIGINS "https://$DOMAIN"
if [ -n "$SMTP_URL" ]; then setenv SMTP_URL "$SMTP_URL"; setenv NOTIFICATIONS_MODE live; fi
[ -n "$MAIL_FROM" ] && setenv MAIL_FROM "$MAIL_FROM"
[ -n "$ADMIN_EMAIL" ] && setenv VAPID_SUBJECT "mailto:$ADMIN_EMAIL"

# 5. Build and start (only Caddy listens on ports 80/443; HTTPS certificates are automatic)
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$COMPOSE up -d --build --remove-orphans
echo "Attente du démarrage de l’API..."
for _ in $(seq 60); do $COMPOSE exec -T api wget -qO- http://localhost:4000/api/health >/dev/null 2>&1 && break; sleep 5; done

# 6. First install: browser notification keys, question bank, first administrator
if [ -z "$(getenv VAPID_PUBLIC_KEY)" ]; then
  KEYS=$($COMPOSE exec -T api node -e "import('web-push').then((m) => { const k = (m.default ?? m).generateVAPIDKeys(); console.log(k.publicKey + ' ' + k.privateKey); })")
  setenv VAPID_PUBLIC_KEY "${KEYS%% *}"; setenv VAPID_PRIVATE_KEY "${KEYS##* }"
  $COMPOSE up -d api
fi
if [ "$FIRST_INSTALL" = 1 ]; then
  $COMPOSE exec -T api node dist/db/seed.js
  if [ -n "$ADMIN_EMAIL" ]; then
    if [ -n "$ADMIN_PASSWORD" ]; then
      $COMPOSE exec -T -e ADMIN_PASSWORD="$ADMIN_PASSWORD" api node dist/db/create-admin.js "$ADMIN_EMAIL" "$ADMIN_FIRST_NAME" "$ADMIN_LAST_NAME" || true
    else
      $COMPOSE exec -T api node dist/db/create-admin.js "$ADMIN_EMAIL" "$ADMIN_FIRST_NAME" "$ADMIN_LAST_NAME" || true
    fi
  fi
fi

# 7. Automatic updates (every 10 minutes, from GitHub) and nightly backups
if [ -d /run/systemd/system ]; then
cat > /etc/systemd/system/c2pass-update.service <<EOF
[Unit]
Description=Mise à jour de C2Pass depuis GitHub
After=docker.service network-online.target
[Service]
Type=oneshot
Environment=DIR=$DIR BRANCH=$BRANCH
ExecStart=$DIR/ops/update.sh
EOF
cat > /etc/systemd/system/c2pass-update.timer <<'EOF'
[Unit]
Description=Mise à jour de C2Pass toutes les 10 minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now c2pass-update.timer
fi
echo "30 2 * * * root cd $DIR && COMPOSE='$COMPOSE' ops/backup.sh >> $DIR/backups/backup.log 2>&1" > /etc/cron.d/c2pass-backup
mkdir -p "$DIR/backups"

echo "== C2Pass est en ligne : https://$DOMAIN"
[ -n "$SMTP_URL" ] || echo "Attention : aucun SMTP_URL, les e-mails (confirmation d’adresse, mot de passe oublié) ne partent pas."
