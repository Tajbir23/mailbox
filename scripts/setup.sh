#!/usr/bin/env bash
#
# Mailbox SaaS – One-Command Server Setup
# ========================================
# Usage:
#   chmod +x scripts/setup.sh
#   sudo bash scripts/setup.sh
#
# What it does:
#   1. Installs Node.js 20, npm, Caddy, pm2
#   2. Clones/pulls the repo to /var/www/mailbox-saas
#   3. Installs npm dependencies & builds the Next.js app
#   4. Generates Caddyfile from .env.local (domain name)
#      (Caddy auto-issues Let's Encrypt certs — no Certbot needed)
#   5. Reloads Caddy
#   6. Starts/restarts PM2 processes (next + smtp)
#   7. Saves PM2 startup so it survives reboots
#
# Re-run safe: can be run multiple times without breaking anything.
#

set -euo pipefail

# Ensure PATH is exported so npm scripts (next, etc.) are found
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

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
ENV_FILE="$APP_DIR/.env.local"
CADDYFILE="/etc/caddy/Caddyfile"

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

# ── git, curl, ufw prereqs ──
apt-get install -y -qq git curl debian-keyring debian-archive-keyring apt-transport-https

# ── Caddy ──
if ! command -v caddy &>/dev/null; then
  info "Installing Caddy..."
  # Official Caddy stable apt repo (cloudsmith)
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi
log "Caddy $(caddy version | head -1)"

# ── If nginx is present from an old setup, stop & disable it (it conflicts on 80/443) ──
if command -v nginx &>/dev/null; then
  if systemctl is-active --quiet nginx; then
    warn "nginx is running — stopping it (Caddy will handle ports 80/443)"
    systemctl stop nginx || true
  fi
  systemctl disable nginx 2>/dev/null || true
fi

# ── PM2 ──
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2 globally..."
  npm install -g pm2 --silent
fi
log "PM2 $(pm2 -v)"

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

# Domain (used by setup script for the Caddyfile)
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
# Install full deps (including devDeps that next build may need)
npm ci --silent 2>/dev/null || npm install --silent

info "Building Next.js production bundle..."
npm run build
log "Build complete"

# ══════════════════════════════════════════════
#  STEP 5 – Caddy configuration (auto-HTTPS + On-Demand TLS)
# ══════════════════════════════════════════════
info "Configuring Caddy for $DOMAIN..."

mkdir -p /etc/caddy

cat > "$CADDYFILE" <<CADDYEOF
{
    # On-Demand TLS approval endpoint — Caddy asks the app whether to
    # issue a cert for an arbitrary hostname (white-label custom domains).
    on_demand_tls {
        ask http://127.0.0.1:3000/api/public/verify-domain
    }
}

# 1) Main domain (always-on TLS, auto-issued by Let's Encrypt)
$DOMAIN, www.$DOMAIN {
    reverse_proxy 127.0.0.1:3000

    # Socket.io routing
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:$SOCKET_PORT
    }

    # Security headers (mirrored from former nginx config)
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-XSS-Protection "1; mode=block"
        # Strict-Transport-Security is also added by the Next.js middleware
    }

    request_body {
        max_size 25MB
    }
}

# 2) Catch-all for On-Demand TLS custom domains
#    Any other hostname pointed at this server gets a cert auto-issued
#    after /api/public/verify-domain returns 2xx.
https:// {
    tls {
        on_demand
    }

    reverse_proxy 127.0.0.1:3000

    # Socket.io routing for custom domains
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:$SOCKET_PORT
    }

    request_body {
        max_size 25MB
    }
}
CADDYEOF

# Fix ownership so Caddy can read its own config / cache certs
chown -R caddy:caddy /var/lib/caddy 2>/dev/null || true

# Validate config
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile 2>/dev/null; then
  err "Caddyfile validation failed. Check $CADDYFILE"
  caddy validate --config "$CADDYFILE" --adapter caddyfile || true
  exit 1
fi

systemctl enable caddy >/dev/null 2>&1 || true

# Reload if already running, otherwise start
if systemctl is-active --quiet caddy; then
  systemctl reload caddy
else
  systemctl restart caddy
fi
log "Caddy configured and reloaded — certs auto-issue on first request"

# ══════════════════════════════════════════════
#  STEP 6 – PM2 ecosystem config
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
#  STEP 7 – Firewall (if ufw active)
# ══════════════════════════════════════════════
if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
  info "Configuring firewall..."
  ufw allow 80/tcp    >/dev/null 2>&1   # HTTP / ACME challenge
  ufw allow 443/tcp   >/dev/null 2>&1   # HTTPS
  ufw allow 443/udp   >/dev/null 2>&1   # HTTP/3 (QUIC)
  ufw allow 25/tcp    >/dev/null 2>&1   # SMTP
  ufw allow 22/tcp    >/dev/null 2>&1   # SSH
  log "Firewall rules added (80, 443/tcp, 443/udp, 25, 22)"
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
echo -e "  Socket.io: port $SOCKET_PORT (proxied via Caddy at /socket.io/*)"
echo ""
echo -e "  PM2 status:  ${YELLOW}pm2 status${NC}"
echo -e "  PM2 logs:    ${YELLOW}pm2 logs${NC}"
echo -e "  Caddy logs:  ${YELLOW}journalctl -u caddy -f${NC}"
echo -e "  Caddyfile:   ${YELLOW}$CADDYFILE${NC}"
echo -e "  Redeploy:    ${YELLOW}sudo bash scripts/deploy.sh${NC}"
echo ""
