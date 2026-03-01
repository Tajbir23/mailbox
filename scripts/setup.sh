#!/usr/bin/env bash
#
# Mailbox SaaS – One-Command Server Setup
# ========================================
# Usage:
#   chmod +x scripts/setup.sh
#   sudo bash scripts/setup.sh
#
# What it does:
#   1. Installs Node.js 20, npm, nginx, certbot, pm2
#   2. Clones/pulls the repo to /var/www/mailbox-saas
#   3. Installs npm dependencies & builds the Next.js app
#   4. Generates nginx config from .env.local (domain name)
#   5. Enables & reloads nginx
#   6. Obtains SSL certificate via certbot (if domain resolves)
#   7. Starts/restarts PM2 processes (next + smtp)
#   8. Saves PM2 startup so it survives reboots
#
# Re-run safe: can be run multiple times without breaking anything.
#

set -euo pipefail

# ───────── Colors ─────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }
info() { echo -e "${CYAN}[i]${NC} $*"; }

# ───────── Must be root ─────────
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (use sudo)"
  exit 1
fi

# ───────── Config ─────────
APP_DIR="/var/www/mailbox-saas"
REPO_URL="${REPO_URL:-}"          # set via env or auto-detect from git
BRANCH="${BRANCH:-main}"
NGINX_SITE="mailbox"
ENV_FILE="$APP_DIR/.env.local"

# ───────── Helper: read value from .env.local ─────────
env_val() {
  local key="$1"
  if [[ -f "$ENV_FILE" ]]; then
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | xargs
  fi
}

# ══════════════════════════════════════════════
#  STEP 1 – System packages
# ══════════════════════════════════════════════
info "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# ── Node.js 20 ──
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
log "Node $(node -v)  npm $(npm -v)"

# ── nginx ──
if ! command -v nginx &>/dev/null; then
  info "Installing nginx..."
  apt-get install -y -qq nginx
fi
log "nginx installed"

# ── certbot ──
if ! command -v certbot &>/dev/null; then
  info "Installing certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx
fi
log "certbot installed"

# ── PM2 ──
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2 globally..."
  npm install -g pm2 --silent
fi
log "PM2 $(pm2 -v)"

# ── git ──
apt-get install -y -qq git

# ══════════════════════════════════════════════
#  STEP 2 – Application code
# ══════════════════════════════════════════════
if [[ -d "$APP_DIR/.git" ]]; then
  info "Pulling latest code..."
  cd "$APP_DIR"
  git fetch --all --quiet
  git reset --hard "origin/$BRANCH" --quiet 2>/dev/null || git reset --hard "origin/$BRANCH"
  log "Code updated to latest $BRANCH"
elif [[ -n "$REPO_URL" ]]; then
  info "Cloning repo..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
  log "Repo cloned to $APP_DIR"
else
  # If we're already inside the project dir (e.g., running from the repo)
  if [[ -f "./package.json" ]] && grep -q "mailbox-saas" "./package.json" 2>/dev/null; then
    APP_DIR="$(pwd)"
    ENV_FILE="$APP_DIR/.env.local"
    log "Using current directory: $APP_DIR"
  else
    err "No repo found at $APP_DIR and REPO_URL is not set."
    err "Usage: REPO_URL=https://github.com/user/repo.git sudo bash scripts/setup.sh"
    exit 1
  fi
fi

cd "$APP_DIR"

# ══════════════════════════════════════════════
#  STEP 3 – .env.local check
# ══════════════════════════════════════════════
if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env.local not found! Creating a template..."
  cat > "$ENV_FILE" <<'ENVEOF'
# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/mailbox-saas

# NextAuth
NEXTAUTH_SECRET=CHANGE_ME_RANDOM_SECRET
NEXTAUTH_URL=https://yourdomain.com

# SMTP Server
SMTP_PORT=25

# Mail server hostname (users point MX records here)
MAIL_SERVER_HOSTNAME=mail.yourdomain.com

# Socket.io
SOCKET_PORT=4000
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com

# Domain (used by setup script for nginx)
DOMAIN=yourdomain.com
ENVEOF
  err "Please edit $ENV_FILE with your actual values, then re-run this script."
  exit 1
fi

# Extract domain from NEXTAUTH_URL or DOMAIN field
DOMAIN=$(env_val "DOMAIN")
if [[ -z "$DOMAIN" ]]; then
  # Try parsing from NEXTAUTH_URL
  NEXTAUTH_URL=$(env_val "NEXTAUTH_URL")
  if [[ -n "$NEXTAUTH_URL" ]]; then
    DOMAIN=$(echo "$NEXTAUTH_URL" | sed -E 's|https?://||' | sed 's|/.*||' | sed 's|:.*||')
  fi
fi

if [[ -z "$DOMAIN" || "$DOMAIN" == "localhost" || "$DOMAIN" == "yourdomain.com" ]]; then
  err "Could not detect domain. Set DOMAIN=yourdomain.com in $ENV_FILE and re-run."
  exit 1
fi

SOCKET_PORT=$(env_val "SOCKET_PORT")
SOCKET_PORT="${SOCKET_PORT:-4000}"

log "Domain: $DOMAIN | Socket port: $SOCKET_PORT"

# ══════════════════════════════════════════════
#  STEP 4 – Install deps & build
# ══════════════════════════════════════════════
info "Installing npm dependencies..."
npm ci --omit=dev --silent 2>/dev/null || npm install --omit=dev --silent

info "Building Next.js production bundle..."
npm run build
log "Build complete"

# ══════════════════════════════════════════════
#  STEP 5 – Nginx configuration
# ══════════════════════════════════════════════
info "Configuring nginx for $DOMAIN..."

NGINX_CONF="/etc/nginx/sites-available/$NGINX_SITE"

cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Next.js app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Socket.io WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:$SOCKET_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 25M;
}
NGINXEOF

# Enable site
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$NGINX_SITE"

# Remove default site if it exists (optional, avoids conflict)
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test & reload
nginx -t
systemctl enable nginx
systemctl reload nginx
log "Nginx configured and reloaded"

# ══════════════════════════════════════════════
#  STEP 6 – SSL with Certbot
# ══════════════════════════════════════════════
info "Checking SSL certificate..."
if certbot certificates 2>/dev/null | grep -q "$DOMAIN"; then
  log "SSL certificate already exists for $DOMAIN"
else
  info "Requesting SSL certificate for $DOMAIN..."
  # Test if domain resolves to this server before requesting
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "")
  DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || echo "")

  if [[ -n "$SERVER_IP" && "$DOMAIN_IP" == "$SERVER_IP" ]]; then
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || {
      warn "Certbot failed. You can run it manually later:"
      warn "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    }
    log "SSL certificate obtained"
  else
    warn "Domain $DOMAIN does not point to this server ($SERVER_IP vs $DOMAIN_IP)."
    warn "Skipping SSL. After DNS propagation, run:"
    warn "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  fi
fi

# ══════════════════════════════════════════════
#  STEP 7 – PM2 ecosystem config
# ══════════════════════════════════════════════
info "Setting up PM2 processes..."

cat > "$APP_DIR/ecosystem.config.js" <<'PM2EOF'
module.exports = {
  apps: [
    {
      name: "mailbox-web",
      cwd: __dirname,
      script: "node_modules/.bin/next",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
    },
    {
      name: "mailbox-smtp",
      cwd: __dirname,
      script: "smtp-server/smtp.js",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "256M",
    },
  ],
};
PM2EOF

# Stop old processes gracefully
pm2 delete mailbox-web 2>/dev/null || true
pm2 delete mailbox-smtp 2>/dev/null || true

# Start fresh
cd "$APP_DIR"
pm2 start ecosystem.config.js
pm2 save

# Auto-start on boot
pm2 startup systemd -u root --hp /root 2>/dev/null || true
pm2 save

log "PM2 processes started"

# ══════════════════════════════════════════════
#  STEP 8 – Firewall (if ufw active)
# ══════════════════════════════════════════════
if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
  info "Configuring firewall..."
  ufw allow 80/tcp   >/dev/null 2>&1
  ufw allow 443/tcp  >/dev/null 2>&1
  ufw allow 25/tcp   >/dev/null 2>&1
  ufw allow 22/tcp   >/dev/null 2>&1
  log "Firewall rules added (80, 443, 25, 22)"
fi

# ══════════════════════════════════════════════
#  DONE
# ══════════════════════════════════════════════
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Mailbox SaaS – Setup Complete! ${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  Web app:   ${CYAN}https://$DOMAIN${NC}"
echo -e "  Admin:     ${CYAN}https://$DOMAIN/admin/domains${NC}"
echo -e "  SMTP:      port 25"
echo -e "  Socket.io: port $SOCKET_PORT"
echo ""
echo -e "  PM2 status:  ${YELLOW}pm2 status${NC}"
echo -e "  PM2 logs:    ${YELLOW}pm2 logs${NC}"
echo -e "  Redeploy:    ${YELLOW}sudo bash scripts/setup.sh${NC}"
echo ""
