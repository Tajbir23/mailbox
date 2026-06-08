#!/usr/bin/env bash
#
# ═══════════════════════════════════════════════════════════════
#  Mailbox SaaS – Complete VPS Setup Script
#  Domain: genuinesoftmart.store
#  VPS IP: 104.207.64.228
# ═══════════════════════════════════════════════════════════════
#
# HOW TO USE:
#   1. SSH into your VPS:  ssh root@104.207.64.228
#   2. Paste this entire script and press Enter
#      OR save to a file and run:  bash setup.sh
#   3. Wait ~5 minutes. Done!
#
# Re-run safe: can be run multiple times without breaking anything.
#

set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export DEBIAN_FRONTEND=noninteractive

# ───────── Colors ─────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }
info() { echo -e "${CYAN}[i]${NC} $*"; }

# ───────── Must be root ─────────
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (use sudo)"
  exit 1
fi

# ───────── Your Config ─────────
DOMAIN="genuinesoftmart.store"
VPS_IP="104.207.64.228"
REPO_URL="https://github.com/Tajbir23/mailbox.git"
APP_DIR="/var/www/mailbox-saas"
BRANCH="main"
CADDYFILE="/etc/caddy/Caddyfile"
ACME_EMAIL="admin@genuinesoftmart.store"

echo ""
echo -e "${CYAN}════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Mailbox SaaS – Starting Setup${NC}"
echo -e "${CYAN}  Domain: $DOMAIN${NC}"
echo -e "${CYAN}  VPS IP: $VPS_IP${NC}"
echo -e "${CYAN}════════════════════════════════════════════${NC}"
echo ""

# ══════════════════════════════════════════════
#  STEP 1 – System Update & Essential Packages
# ══════════════════════════════════════════════
info "Step 1/9: Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ufw debian-keyring debian-archive-keyring apt-transport-https ca-certificates gnupg
log "System updated"

# ══════════════════════════════════════════════
#  STEP 2 – Install Node.js 20
# ══════════════════════════════════════════════
info "Step 2/9: Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
log "Node $(node -v) | npm $(npm -v)"

# ══════════════════════════════════════════════
#  STEP 3 – Install PM2
# ══════════════════════════════════════════════
info "Step 3/9: Installing PM2..."
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2 --silent
fi
log "PM2 $(pm2 -v)"

# ══════════════════════════════════════════════
#  STEP 4 – Install Caddy (Nginx alternative, auto HTTPS)
# ══════════════════════════════════════════════
info "Step 4/9: Installing Caddy..."
if ! command -v caddy &>/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi
log "Caddy $(caddy version | head -1)"

# Stop nginx if running (conflicts with Caddy on 80/443)
if command -v nginx &>/dev/null; then
  systemctl stop nginx 2>/dev/null || true
  systemctl disable nginx 2>/dev/null || true
  warn "nginx stopped and disabled (Caddy handles ports 80/443)"
fi

# Also check if apache2 is running
if systemctl is-active --quiet apache2 2>/dev/null; then
  systemctl stop apache2 2>/dev/null || true
  systemctl disable apache2 2>/dev/null || true
  warn "apache2 stopped and disabled (Caddy handles ports 80/443)"
fi

# ══════════════════════════════════════════════
#  STEP 5 – Firewall (before anything binds to ports)
# ══════════════════════════════════════════════
info "Step 5/9: Configuring firewall..."
if command -v ufw &>/dev/null; then
  # Make sure SSH is allowed BEFORE enabling (prevents lockout)
  ufw allow 22/tcp   >/dev/null 2>&1
  ufw --force enable 2>/dev/null || true
  ufw allow 80/tcp   >/dev/null 2>&1   # HTTP (ACME challenge)
  ufw allow 443/tcp  >/dev/null 2>&1   # HTTPS
  ufw allow 443/udp  >/dev/null 2>&1   # HTTP/3 (QUIC)
  ufw allow 25/tcp   >/dev/null 2>&1   # SMTP (incoming email)
  log "Firewall configured (22, 25, 80, 443)"
else
  warn "ufw not found, skipping firewall config"
fi

# ══════════════════════════════════════════════
#  STEP 6 – Clone/Update Repository
# ══════════════════════════════════════════════
info "Step 6/9: Setting up application code..."
mkdir -p /var/www

if [[ -d "$APP_DIR/.git" ]]; then
  cd "$APP_DIR"
  git fetch --all --quiet
  git reset --hard "origin/$BRANCH" || {
    warn "git reset failed, trying fresh clone..."
    cd /var/www
    rm -rf "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  }
  cd "$APP_DIR"
  log "Code updated to latest $BRANCH"
else
  if [[ -d "$APP_DIR" ]]; then
    rm -rf "$APP_DIR"
  fi
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
  log "Repo cloned to $APP_DIR"
fi

cd "$APP_DIR"

# ══════════════════════════════════════════════
#  STEP 7 – Create .env.local (Production Config)
# ══════════════════════════════════════════════
info "Step 7/9: Creating environment configuration..."

# ── 7a: OIDC RSA signing keys ──
# These keys sign the ID tokens issued by the OIDC Identity Provider.
# IMPORTANT: Reuse existing keys if present so re-running this script does NOT
# invalidate already-issued tokens. Only generate fresh keys on first setup.
OIDC_PRIV=""
OIDC_PUB=""

if [[ -f "$APP_DIR/.env.local" ]]; then
  EXISTING_PRIV=$(grep -E '^OIDC_RSA_PRIVATE_KEY=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  EXISTING_PUB=$(grep -E '^OIDC_RSA_PUBLIC_KEY=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  # Reuse only if they are real keys (not empty and not placeholder values)
  if [[ -n "$EXISTING_PRIV" && "$EXISTING_PRIV" != replace-with-* && -n "$EXISTING_PUB" && "$EXISTING_PUB" != replace-with-* ]]; then
    OIDC_PRIV="$EXISTING_PRIV"
    OIDC_PUB="$EXISTING_PUB"
    log "Reusing existing OIDC RSA keys (tokens stay valid)"
  fi
fi

if [[ -z "$OIDC_PRIV" || -z "$OIDC_PUB" ]]; then
  info "Generating new OIDC RSA key pair (2048-bit)..."
  node -e "
    const c = require('crypto');
    const fs = require('fs');
    const { publicKey, privateKey } = c.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.writeFileSync('/tmp/oidc_priv.b64', Buffer.from(privateKey).toString('base64'));
    fs.writeFileSync('/tmp/oidc_pub.b64', Buffer.from(publicKey).toString('base64'));
  "
  OIDC_PRIV=$(cat /tmp/oidc_priv.b64)
  OIDC_PUB=$(cat /tmp/oidc_pub.b64)
  rm -f /tmp/oidc_priv.b64 /tmp/oidc_pub.b64
  log "OIDC RSA keys generated"
fi

# ── 7b: Write base config (quoted heredoc — no variable expansion) ──
cat > "$APP_DIR/.env.local" << 'EOF'
# MongoDB Atlas
MONGODB_URI=mongodb+srv://noyontalukdar104:SYu2IolJM7Ai9Fgz@cluster0.nruferz.mongodb.net/mail-box?retryWrites=true&w=majority&appName=Cluster0

# NextAuth
NEXTAUTH_SECRET=mBsaaS-x7k2F9pQ4rZ3vW8nL5jC1dH6tY0mA
NEXTAUTH_URL=https://genuinesoftmart.store

# SMTP Server
SMTP_PORT=25
MAIL_SERVER_HOSTNAME=mail.genuinesoftmart.store

# Socket.io
SOCKET_PORT=4000
NEXT_PUBLIC_SOCKET_URL=https://genuinesoftmart.store

# Domain (used by setup script)
DOMAIN=genuinesoftmart.store
EOF

# ── 7c: Append OIDC Identity Provider config (variable expansion needed) ──
cat >> "$APP_DIR/.env.local" << EOF

# ─────────────────────────────────────────────────────────────────────────────
# OIDC Identity Provider (SSO Login)
# ─────────────────────────────────────────────────────────────────────────────
# Lets external apps (ChatGPT, Slack, Notion, etc.) "Sign in with Mailbox".
# Keys are auto-generated by this setup script. Do NOT regenerate manually
# unless you intend to invalidate all previously issued tokens.
OIDC_RSA_PRIVATE_KEY=$OIDC_PRIV
OIDC_RSA_PUBLIC_KEY=$OIDC_PUB
OIDC_ISSUER_URL=https://genuinesoftmart.store
EOF

# Also copy to .env.production (Next.js reads this in production mode)
cp "$APP_DIR/.env.local" "$APP_DIR/.env.production"

log "Environment files created (incl. OIDC keys)"

# ══════════════════════════════════════════════
#  STEP 8 – Install Dependencies & Build
# ══════════════════════════════════════════════
info "Step 8/9: Installing dependencies & building..."
cd "$APP_DIR"

# Install all deps (including devDependencies needed for build)
npm ci 2>/dev/null || npm install
log "Dependencies installed"

info "Building Next.js production bundle (this takes 1-3 minutes)..."
npm run build
log "Build complete!"

# ══════════════════════════════════════════════
#  STEP 9 – PM2 + Caddy (Start app FIRST, then configure Caddy)
# ══════════════════════════════════════════════
info "Step 9/9: Starting services..."

# ── 9a: Create PM2 ecosystem config ──
cat > "$APP_DIR/ecosystem.config.js" << 'PM2EOF'
module.exports = {
  apps: [
    {
      name: "mailbox-web",
      cwd: "/var/www/mailbox-saas",
      script: "node_modules/.bin/next",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      watch: false,
    },
    {
      name: "mailbox-smtp",
      cwd: "/var/www/mailbox-saas",
      script: "smtp-server/smtp.js",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "256M",
      watch: false,
    },
  ],
};
PM2EOF

# ── 9b: Start PM2 processes FIRST (so port 3000 is available for Caddy's ask endpoint) ──
pm2 delete mailbox-web 2>/dev/null || true
pm2 delete mailbox-smtp 2>/dev/null || true

cd "$APP_DIR"
pm2 start ecosystem.config.js
pm2 save

# Auto-start PM2 on boot
pm2 startup systemd -u root --hp /root 2>/dev/null || true
pm2 save

log "PM2 processes started (web:3000, smtp:25, socket.io:4000)"

# Wait a few seconds for Next.js to fully boot before Caddy tries to use it
info "Waiting 5 seconds for Next.js to initialize..."
sleep 5

# Verify Next.js is responding
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 | grep -qE "^(200|301|302|304)"; then
  log "Next.js is responding on port 3000"
else
  warn "Next.js may still be starting — Caddy will retry automatically"
fi

# ── 9c: Configure Caddy (AFTER app is running) ──
info "Configuring Caddy reverse proxy & SSL..."

mkdir -p /etc/caddy

cat > "$CADDYFILE" << CADDYEOF
{
    # Email for Let's Encrypt certificate expiry notifications
    email $ACME_EMAIL

    # On-Demand TLS approval endpoint — Caddy asks the app whether to
    # issue a cert for an arbitrary hostname (white-label custom domains).
    on_demand_tls {
        ask http://127.0.0.1:3000/api/public/verify-domain
    }
}

# 1) Main domain (always-on TLS, auto Let's Encrypt cert)
$DOMAIN, www.$DOMAIN {
    # Proxy all traffic to Next.js
    reverse_proxy 127.0.0.1:3000

    # Socket.io WebSocket routing (must come before the general proxy
    # so WebSocket upgrade requests hit the correct backend)
    @socketio path /socket.io/*
    handle @socketio {
        reverse_proxy 127.0.0.1:4000
    }

    # Security headers
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-XSS-Protection "1; mode=block"
        -Server
    }

    # Max upload size (25MB for email attachments via API)
    request_body {
        max_size 25MB
    }
}

# 2) Catch-all for On-Demand TLS custom domains
#    Any hostname pointed at this server gets a cert auto-issued
#    after /api/public/verify-domain returns 2xx.
https:// {
    tls {
        on_demand
    }

    reverse_proxy 127.0.0.1:3000

    @socketio path /socket.io/*
    handle @socketio {
        reverse_proxy 127.0.0.1:4000
    }

    request_body {
        max_size 25MB
    }
}
CADDYEOF

# Fix ownership so Caddy can cache certs
mkdir -p /var/lib/caddy
chown -R caddy:caddy /var/lib/caddy 2>/dev/null || true
chown caddy:caddy "$CADDYFILE" 2>/dev/null || true

# Format Caddyfile (fixes any whitespace issues)
caddy fmt --overwrite "$CADDYFILE" 2>/dev/null || true

# Validate Caddyfile
if caddy validate --config "$CADDYFILE" --adapter caddyfile 2>/dev/null; then
  log "Caddyfile validated successfully"
else
  err "Caddyfile validation failed! Checking syntax..."
  caddy validate --config "$CADDYFILE" --adapter caddyfile || true
  warn "Attempting to proceed anyway..."
fi

# Enable and start/reload Caddy
systemctl enable caddy >/dev/null 2>&1 || true
systemctl stop caddy 2>/dev/null || true
systemctl start caddy

# Give Caddy a moment to obtain the initial cert
sleep 3

# Check if Caddy is running
if systemctl is-active --quiet caddy; then
  log "Caddy is running — HTTPS will auto-activate when DNS points here"
else
  err "Caddy failed to start. Check: journalctl -u caddy -f"
  warn "Common fix: make sure no other service is using port 80/443"
  warn "Run: ss -tlnp | grep -E ':80 |:443 '"
fi

# ══════════════════════════════════════════════
#  SEED ADMIN USER
# ══════════════════════════════════════════════
info "Seeding admin user..."
cd "$APP_DIR"
node scripts/seed-admin.js 2>/dev/null && log "Admin user seeded" || warn "Admin seed skipped (may already exist)"

# ══════════════════════════════════════════════
#  FINAL VERIFICATION
# ══════════════════════════════════════════════
echo ""
info "Running final verification..."

# Check PM2 processes
PM2_WEB=$(pm2 jlist 2>/dev/null | grep -o '"name":"mailbox-web"' | wc -l)
PM2_SMTP=$(pm2 jlist 2>/dev/null | grep -o '"name":"mailbox-smtp"' | wc -l)

if [[ "$PM2_WEB" -ge 1 ]] && [[ "$PM2_SMTP" -ge 1 ]]; then
  log "PM2: Both processes running"
else
  warn "PM2: Check process status with 'pm2 status'"
fi

# Check Caddy
if systemctl is-active --quiet caddy; then
  log "Caddy: Running"
else
  err "Caddy: Not running!"
fi

# Check if port 25 is listening
if ss -tlnp 2>/dev/null | grep -q ":25 "; then
  log "SMTP: Port 25 is listening"
else
  warn "SMTP: Port 25 not yet listening (check pm2 logs mailbox-smtp)"
fi

# Check if port 3000 is listening
if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
  log "Web: Port 3000 is listening"
else
  warn "Web: Port 3000 not yet listening (check pm2 logs mailbox-web)"
fi

# ══════════════════════════════════════════════
#  DONE!
# ══════════════════════════════════════════════
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Mailbox SaaS – Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Web app:    ${CYAN}https://$DOMAIN${NC}"
echo -e "  Admin:      ${CYAN}https://$DOMAIN/admin${NC}"
echo -e "  SMTP:       port 25 (receiving emails)"
echo -e "  Socket.io:  port 4000 (proxied via Caddy at /socket.io/*)"
echo ""
echo -e "  OIDC SSO Provider (Sign in with Mailbox):"
echo -e "     Discovery: ${CYAN}https://$DOMAIN/.well-known/openid-configuration${NC}"
echo -e "     JWKS:      ${CYAN}https://$DOMAIN/.well-known/jwks.json${NC}"
echo -e "     Manage clients: ${CYAN}https://$DOMAIN/admin/oauth-clients${NC}"
echo ""
echo -e "  Admin Login:"
echo -e "     Email:    ${YELLOW}admin@mailbox.local${NC}"
echo -e "     Password: ${YELLOW}admin123${NC}"
echo -e "     ${RED}Change this password immediately after first login!${NC}"
echo ""
echo -e "  Useful Commands:"
echo -e "     ${YELLOW}pm2 status${NC}              - Check process status"
echo -e "     ${YELLOW}pm2 logs${NC}                - View live logs"
echo -e "     ${YELLOW}pm2 logs mailbox-web${NC}    - Web app logs only"
echo -e "     ${YELLOW}pm2 logs mailbox-smtp${NC}   - SMTP logs only"
echo -e "     ${YELLOW}journalctl -u caddy -f${NC}  - Caddy/SSL logs"
echo -e "     ${YELLOW}sudo bash scripts/deploy.sh${NC} - Redeploy after code updates"
echo ""
echo -e "  DNS Records (set at your domain registrar):"
echo -e "     A    @     ->  $VPS_IP"
echo -e "     A    www   ->  $VPS_IP"
echo -e "     A    mail  ->  $VPS_IP"
echo -e "     MX   @     ->  mail.$DOMAIN (Priority: 10)"
echo ""
echo -e "  SSL Certificate:"
echo -e "     Caddy auto-obtains Let's Encrypt cert on first HTTPS request."
echo -e "     Make sure DNS A records point to $VPS_IP BEFORE accessing https://$DOMAIN"
echo -e "     Check cert status: ${YELLOW}journalctl -u caddy | grep -i tls${NC}"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
