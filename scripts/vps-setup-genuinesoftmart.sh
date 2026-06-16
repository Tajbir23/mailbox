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
# Auto-detect this server's public IP — no hardcoded value. Tries external
# echo services first, then falls back to the host's own routable interface.
# Used for SPF + website-hosting A records shown in the domain setup guide.
detect_public_ip() {
  local ip=""
  for url in https://api.ipify.org https://ifconfig.me https://icanhazip.com https://ipinfo.io/ip; do
    ip="$(curl -fsS --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]')"
    [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && { echo "$ip"; return; }
  done
  # Fallback: the IP used for outbound routing (works without internet echo svc).
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[0-9.]+' | head -1)"
  [[ -n "$ip" ]] && { echo "$ip"; return; }
  # Last resort: first non-loopback IPv4 on the host.
  hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | grep -v '^127\.' | head -1
}
VPS_IP="$(detect_public_ip)"
REPO_URL="https://github.com/Tajbir23/mailbox.git"
APP_DIR="/var/www/mailbox-saas"
BRANCH="main"
CADDYFILE="/etc/caddy/Caddyfile"
ACME_EMAIL="admin@genuinesoftmart.store"

if [[ -z "$VPS_IP" ]]; then
  warn "Could not auto-detect public IP — SPF/hosting A records in the guide may be blank."
fi

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

# ── 7a-2: SAML 2.0 signing certificate + key ──
# Signs SAML assertions/metadata issued by the SAML Identity Provider.
# IMPORTANT: Reuse the existing cert if present so re-running this script does
# NOT break already-configured Service Providers. Only generate on first setup.
SAML_CERT=""
SAML_KEY=""

if [[ -f "$APP_DIR/.env.local" ]]; then
  EXISTING_SAML_CERT=$(grep -E '^SAML_SIGNING_CERT=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  EXISTING_SAML_KEY=$(grep -E '^SAML_SIGNING_KEY=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  # Reuse only if they are real values (not empty and not placeholder values)
  if [[ -n "$EXISTING_SAML_CERT" && "$EXISTING_SAML_CERT" != replace-with-* && -n "$EXISTING_SAML_KEY" && "$EXISTING_SAML_KEY" != replace-with-* ]]; then
    SAML_CERT="$EXISTING_SAML_CERT"
    SAML_KEY="$EXISTING_SAML_KEY"
    log "Reusing existing SAML signing certificate"
  fi
fi

if [[ -z "$SAML_CERT" || -z "$SAML_KEY" ]]; then
  info "Generating new SAML signing certificate (2048-bit, self-signed)..."
  SAML_OUT=$(node scripts/generate-saml-cert.js 2>/dev/null)
  SAML_CERT=$(echo "$SAML_OUT" | grep '^SAML_SIGNING_CERT=' | head -1 | cut -d= -f2-)
  SAML_KEY=$(echo "$SAML_OUT" | grep '^SAML_SIGNING_KEY=' | head -1 | cut -d= -f2-)
  log "SAML signing certificate generated"
fi

# ── 7a-3: Outbound email (send-email feature) — relay creds + internal emit secret ──
# Relay credentials are EXTERNAL secrets we cannot auto-provision. They are
# preserved across re-runs, and may be supplied on first run via shell env vars:
#   SMTP_RELAY_HOST=... SMTP_RELAY_USER=... SMTP_RELAY_PASS=... bash setup.sh
# The INTERNAL_EMIT_SECRET (used by the Next.js app <-> smtp-server emit bridge)
# is auto-generated once and then reused so real-time send status keeps working.
RELAY_HOST="${SMTP_RELAY_HOST:-}"
RELAY_PORT="${SMTP_RELAY_PORT:-587}"
RELAY_USER="${SMTP_RELAY_USER:-}"
RELAY_PASS="${SMTP_RELAY_PASS:-}"
RELAY_SECURE="${SMTP_RELAY_SECURE:-false}"
EMIT_SECRET=""

if [[ -f "$APP_DIR/.env.local" ]]; then
  # Preserve previously-configured relay credentials unless overridden by env vars.
  EX_RELAY_HOST=$(grep -E '^SMTP_RELAY_HOST=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  EX_RELAY_PORT=$(grep -E '^SMTP_RELAY_PORT=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  EX_RELAY_USER=$(grep -E '^SMTP_RELAY_USER=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  EX_RELAY_PASS=$(grep -E '^SMTP_RELAY_PASS=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  EX_RELAY_SECURE=$(grep -E '^SMTP_RELAY_SECURE=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  EX_EMIT_SECRET=$(grep -E '^INTERNAL_EMIT_SECRET=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)

  [[ -z "$RELAY_HOST" && -n "$EX_RELAY_HOST" ]] && RELAY_HOST="$EX_RELAY_HOST"
  [[ -z "${SMTP_RELAY_PORT:-}" && -n "$EX_RELAY_PORT" ]] && RELAY_PORT="$EX_RELAY_PORT"
  [[ -z "$RELAY_USER" && -n "$EX_RELAY_USER" ]] && RELAY_USER="$EX_RELAY_USER"
  [[ -z "$RELAY_PASS" && -n "$EX_RELAY_PASS" ]] && RELAY_PASS="$EX_RELAY_PASS"
  [[ -z "${SMTP_RELAY_SECURE:-}" && -n "$EX_RELAY_SECURE" ]] && RELAY_SECURE="$EX_RELAY_SECURE"
  [[ -n "$EX_EMIT_SECRET" && "$EX_EMIT_SECRET" != replace-with-* ]] && EMIT_SECRET="$EX_EMIT_SECRET"
fi

if [[ -z "$EMIT_SECRET" ]]; then
  EMIT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  log "Generated INTERNAL_EMIT_SECRET for the real-time send bridge"
else
  log "Reusing existing INTERNAL_EMIT_SECRET"
fi

if [[ -n "$RELAY_HOST" ]]; then
  log "SMTP relay configured ($RELAY_HOST:$RELAY_PORT) — outbound via relay"
else
  log "No SMTP relay set — outbound uses DIRECT-to-MX delivery (no relay needed)"
fi

# ── 7a-4: DKIM signing key (auto-generated, reused across re-runs) ──
# DKIM lets receivers (Gmail, Outlook, …) cryptographically verify mail sent
# from your domain — essential for inbox delivery, especially in direct mode.
# We generate the key automatically; you only publish ONE DNS TXT record (printed
# at the end). Outbound sending works even before you add it (may land in spam).
DKIM_SELECTOR="mail"
DKIM_PRIV=""

if [[ -f "$APP_DIR/.env.local" ]]; then
  EX_DKIM_PRIV=$(grep -E '^DKIM_PRIVATE_KEY=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  EX_DKIM_SELECTOR=$(grep -E '^DKIM_SELECTOR=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- || true)
  if [[ -n "$EX_DKIM_PRIV" && "$EX_DKIM_PRIV" != replace-with-* ]]; then
    DKIM_PRIV="$EX_DKIM_PRIV"
    [[ -n "$EX_DKIM_SELECTOR" ]] && DKIM_SELECTOR="$EX_DKIM_SELECTOR"
    log "Reusing existing DKIM signing key (selector: $DKIM_SELECTOR)"
  fi
fi

if [[ -z "$DKIM_PRIV" ]]; then
  info "Generating new DKIM signing key (2048-bit)..."
  node -e "
    const c = require('crypto');
    const fs = require('fs');
    const { privateKey } = c.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.writeFileSync('/tmp/dkim_priv.b64', Buffer.from(privateKey).toString('base64'));
  "
  DKIM_PRIV=$(cat /tmp/dkim_priv.b64)
  rm -f /tmp/dkim_priv.b64
  log "DKIM signing key generated (selector: $DKIM_SELECTOR)"
fi

# Derive the public key (single-line base64, no PEM armor) for the DNS TXT record.
DKIM_PUB=$(node -e "
  const c = require('crypto');
  const pem = Buffer.from(process.argv[1], 'base64').toString('utf8');
  const pub = c.createPublicKey(pem)
    .export({ type: 'spki', format: 'pem' })
    .toString()
    .split('\n')
    .filter((l) => l && !l.startsWith('-----'))
    .join('');
  console.log(pub);
" "$DKIM_PRIV" 2>/dev/null || true)

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

# ─────────────────────────────────────────────────────────────────────────────
# SAML 2.0 Identity Provider signing certificate + key (base64 PEM)
# ─────────────────────────────────────────────────────────────────────────────
# Signs SAML assertions/metadata. Auto-generated by this setup script. Do NOT
# regenerate manually unless you intend to re-configure all Service Providers.
SAML_SIGNING_CERT=$SAML_CERT
SAML_SIGNING_KEY=$SAML_KEY
EOF

# ── 7d: Append outbound email (send-email feature) config ──
cat >> "$APP_DIR/.env.local" << EOF

# ─────────────────────────────────────────────────────────────────────────────
# Outbound email (send-email feature)
# ─────────────────────────────────────────────────────────────────────────────
# Delivery mode:
#   auto    = use the SMTP relay below if set, otherwise deliver direct-to-MX
#   direct  = always deliver straight to the recipient's mail server (no relay)
#   relay   = always use the SMTP relay below
#   disabled= turn outbound sending off
# Default "auto" means sending works out of the box with NO relay account.
OUTBOUND_MODE=auto

# Public IP of this server — used for SPF records and website-hosting A records
# shown in each user's domain setup guide.
SERVER_PUBLIC_IP=$VPS_IP
HOSTING_SERVER_IP=$VPS_IP

# Optional SMTP relay (only used in auto/relay mode). Leave blank to send direct.
# Preserved across re-runs; may also be passed once via shell env vars.
# Better deliverability if you have a provider (SES, Postmark, Mailgun, …).
SMTP_RELAY_HOST=$RELAY_HOST
SMTP_RELAY_PORT=$RELAY_PORT
SMTP_RELAY_USER=$RELAY_USER
SMTP_RELAY_PASS=$RELAY_PASS
SMTP_RELAY_SECURE=$RELAY_SECURE

# DKIM signing (auto-generated). Publish the printed DNS TXT record so Gmail/
# Outlook trust your mail. The private key stays here; never share it.
DKIM_DOMAIN=$DOMAIN
DKIM_SELECTOR=$DKIM_SELECTOR
DKIM_PRIVATE_KEY=$DKIM_PRIV

# Internal emit bridge — the Next.js app POSTs here so the smtp-server process
# (which owns Socket.io) can push real-time sent/failed status. Localhost only;
# the secret is shared by both processes and auto-generated on first setup.
INTERNAL_EMIT_SECRET=$EMIT_SECRET
INTERNAL_EMIT_PORT=4001

# Send rate limiting (per-user and per-mailbox, rolling window)
SEND_RATE_USER_MAX=50
SEND_RATE_MAILBOX_MAX=100
SEND_RATE_WINDOW_MS=3600000
EOF

# Also copy to .env.production (Next.js reads this in production mode)
cp "$APP_DIR/.env.local" "$APP_DIR/.env.production"

log "Environment files created (incl. OIDC keys + SAML cert + outbound email + DKIM)"

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

# Check the internal emit bridge (localhost only — must NOT be publicly exposed)
if ss -tlnp 2>/dev/null | grep -q "127.0.0.1:4001 "; then
  log "Emit bridge: Port 4001 listening on localhost (real-time send status)"
else
  warn "Emit bridge: Port 4001 not listening (check pm2 logs mailbox-smtp)"
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
echo -e "  SAML SSO Provider (Enterprise SAML 2.0):"
echo -e "     SAML metadata: ${CYAN}https://$DOMAIN/api/saml/metadata${NC}"
echo -e "     SAML SPs:      ${CYAN}https://$DOMAIN/admin/saml-clients${NC}"
echo ""
echo -e "  Outbound Email (send from your mailboxes to anyone, e.g. Gmail):"
if [[ -n "$RELAY_HOST" ]]; then
echo -e "     Status:   ${GREEN}ENABLED${NC} via relay $RELAY_HOST:$RELAY_PORT (mode: auto)"
else
echo -e "     Status:   ${GREEN}ENABLED${NC} — DIRECT-to-MX delivery, no relay needed (mode: auto)"
fi
echo -e "     ${YELLOW}For INBOX delivery (not spam), add the 3 DNS records below.${NC}"
echo ""
echo -e "  ${CYAN}DNS records for email deliverability (add at your DNS provider):${NC}"
echo -e "     ${YELLOW}1) SPF${NC}   TXT  @                  ->  ${GREEN}v=spf1 a mx ip4:$VPS_IP ~all${NC}"
echo -e "     ${YELLOW}2) DMARC${NC} TXT  _dmarc             ->  ${GREEN}v=DMARC1; p=none; rua=mailto:admin@$DOMAIN${NC}"
if [[ -n "$DKIM_PUB" ]]; then
echo -e "     ${YELLOW}3) DKIM${NC}  TXT  ${DKIM_SELECTOR}._domainkey  ->  ${GREEN}v=DKIM1; k=rsa; p=$DKIM_PUB${NC}"
else
echo -e "     ${YELLOW}3) DKIM${NC}  TXT  ${DKIM_SELECTOR}._domainkey  ->  (key generated; value in .env.local)"
fi
echo -e "     ${YELLOW}+ PTR${NC} (reverse DNS): ask your VPS host to point $VPS_IP -> mail.$DOMAIN"
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
