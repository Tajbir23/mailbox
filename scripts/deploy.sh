#!/usr/bin/env bash
#
# Mailbox SaaS – Quick Redeploy
# ==============================
# Usage:  sudo bash scripts/deploy.sh
#
# Pulls latest code, rebuilds, and restarts PM2 processes.
# For first-time setup, use: sudo bash scripts/setup.sh
#

set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
info() { echo -e "${CYAN}[i]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }

APP_DIR="/var/www/mailbox-saas"
cd "$APP_DIR"

info "Pulling latest code..."
# package-lock.json is regenerated locally by `npm install` on each deploy,
# which would otherwise block `git pull`. Discard the auto-generated change
# before pulling so the repo version always wins.
git checkout -- package-lock.json 2>/dev/null || true
git pull origin main
log "Code updated"

info "Installing dependencies..."
npm install
log "Dependencies installed"

info "Building Next.js..."
npm run build
log "Build complete"

info "Restarting PM2 processes..."
pm2 restart ecosystem.config.js
pm2 save
log "All processes restarted"

# Reload caddy (in case Caddyfile changed)
systemctl reload caddy
log "Caddy reloaded"

echo ""
echo -e "${GREEN}Redeploy complete!${NC} Run ${CYAN}pm2 logs${NC} to check."
