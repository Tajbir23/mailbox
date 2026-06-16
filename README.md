# MailboxSaaS

Self-hosted email SaaS platform (**send + receive**) built with **Next.js 14**, a custom **SMTP server**, **MongoDB Atlas**, **NextAuth**, and **Socket.io** for real-time email delivery. Users create mailboxes on verified domains and can send mail to anyone (Gmail, Outlook, …) — either direct-to-MX (no relay) or via an optional SMTP relay.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Local Development Setup](#local-development-setup)
5. [Environment Variables](#environment-variables)
6. [Domain Configuration & DNS Setup (User Approval Flow)](#domain-configuration--dns-setup-user-approval-flow)
7. [Quick Auto-Setup (Recommended)](#quick-auto-setup-recommended)
7. [VPS Production Setup (Step-by-Step)](#vps-production-setup-step-by-step)
   - [1. Server Preparation](#1-server-preparation)
   - [2. Install Node.js (via NVM)](#2-install-nodejs-via-nvm)
   - [3. Install PM2](#3-install-pm2)
   - [4. Install & Configure Caddy](#4-install--configure-caddy)
   - [5. Clone the Repository](#5-clone-the-repository)
   - [6. Configure Environment Variables](#6-configure-environment-variables)
   - [7. Install Dependencies & Build](#7-install-dependencies--build)
   - [8. Seed Admin User](#8-seed-admin-user)
   - [9. Start Services with PM2](#9-start-services-with-pm2)
   - [10. Caddyfile (HTTPS + Custom Domains)](#10-caddyfile-https--custom-domains)
8. [DNS Configuration](#dns-configuration)
9. [White-Label Custom Domains (On-Demand TLS)](#white-label-custom-domains-on-demand-tls)
10. [OIDC Identity Provider (Sign in with Mailbox)](#oidc-identity-provider-sign-in-with-mailbox)
11. [GitHub Actions CI/CD](#github-actions-cicd)
12. [Admin Panel](#admin-panel)
13. [SMTP Server Details](#smtp-server-details)
14. [Socket.io Real-time](#socketio-real-time)
15. [Security](#security)
16. [Useful PM2 & Caddy Commands](#useful-pm2--caddy-commands)
17. [Troubleshooting](#troubleshooting)
18. [License](#license)

---

## Features

- **Outbound Email (Send / Reply / Forward)** — Users send mail from their mailbox to anyone (Gmail, Outlook, …) with To/Cc/Bcc and attachments. Works out of the box via **direct-to-MX delivery (no relay account needed)**, with an optional SMTP relay for best deliverability. Auto DKIM signing, per-user/per-mailbox rate limiting, a stored Sent history, and real-time `sent`/`failed` status.
- **Domain Configuration Approval + DNS Setup Guide** — A user requests a domain, an admin approves it from the admin panel (single approval), and the user gets a complete, copy-ready DNS guide — ownership (MX + TXT), email sending (SPF + DKIM + DMARC), website hosting (A records), and PTR guidance — each record annotated with what it does and where to add it.
- **OIDC Identity Provider (Sign in with Mailbox)** — The platform acts as a standards-compliant OpenID Connect provider. External apps (ChatGPT, Slack, Notion, or any OIDC client) can use "Sign in with Mailbox" for SSO. Supports authorization code flow, PKCE, refresh-token rotation, consent screens, and admin-managed OAuth clients.
- **White-Label Custom Domains** — Users can point their own domain completely to the service without redirect issues. Caddy auto-provisions Let's Encrypt certs per domain via On-Demand TLS.
- **Custom Domains** — Add your own domains with MX + TXT DNS verification
- **Real-Time Inbox** — Emails arrive instantly via WebSocket (Socket.io)
- **Team Sharing** — Share mailboxes with team members
- **Mailbox Management** — Create, transfer ownership, set auto-expiry, delete
- **Admin Panel** — Dashboard overview, user management (promote/demote/reset password/delete), domain management, server monitoring (CPU, RAM, storage, email volume charts), domain hosting approvals.
- **In-App Notifications** — Real-time notification bell and persistent popups for important updates (like domain approvals).
- **Copy Email Address** — One-click copy for created mailboxes
- **Read/Unread Tracking** — Visual indicators for email read status
- **Auto-Expiry Cleanup** — Expired mailboxes are automatically deleted every 60 seconds
- **Security** — CSP, HSTS, rate limiting, XSS protection, input sanitization
- **SEO Optimized** — Rich metadata, JSON-LD, sitemap, robots.txt

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), Tailwind CSS 3, Inter font |
| **Auth** | NextAuth 4 with JWT strategy, role-based (admin/user) |
| **Database** | MongoDB Atlas (Mongoose 8) |
| **Email** | Custom SMTP server (`smtp-server` + `mailparser`) |
| **Real-time** | Socket.io 4 (server inside SMTP process, client in React) |
| **Process Manager** | PM2 |
| **Reverse Proxy** | Caddy (with automatic HTTPS + On-Demand TLS) |
| **SSL** | Let's Encrypt — fully automated by Caddy (no Certbot needed) |
| **CI/CD** | GitHub Actions → SSH deploy |
| **Design** | Glass morphism, gradient system, responsive |

## Project Structure

```
mailbox-saas/
├── app/
│   ├── (auth)/              # Login & Register pages
│   ├── admin/
│   │   ├── page.js          # Admin dashboard overview
│   │   ├── domains/         # Domain management
│   │   ├── users/           # User management (search, roles, delete)
│   │   └── monitor/         # Server monitoring (CPU, RAM, charts)
│   ├── api/
│   │   ├── auth/            # NextAuth + register endpoint
│   │   ├── admin/           # Admin APIs (domains, users, stats)
│   │   ├── domains/         # Public domain listing
│   │   ├── mailboxes/       # Mailbox CRUD, emails, sharing
│   │   ├── public/
│   │   │   └── verify-domain/  # Endpoint Caddy hits for On-Demand TLS approval
│   │   └── user/            # User domain management & verification
│   ├── dashboard/           # User dashboard + inbox
│   ├── layout.js            # Root layout with providers
│   ├── globals.css          # Design system (Tailwind + custom)
│   ├── page.js              # Landing page
│   ├── robots.js            # SEO robots.txt
│   └── sitemap.js           # SEO sitemap
├── components/
│   ├── Navbar.js            # Navigation with admin links
│   ├── MailboxList.js       # Dashboard mailbox list (real-time)
│   └── InboxView.js         # Email inbox with real-time updates
├── lib/
│   ├── auth.js              # NextAuth config (credentials, JWT)
│   ├── mongodb.js           # Mongoose connection singleton
│   ├── rate-limit.js        # API rate limiting
│   ├── sanitize.js          # Input sanitization
│   ├── oidc/                # OIDC Identity Provider core
│   │   ├── keys.js          # RSA key loading + JWKS export
│   │   ├── authorize.js     # Authorization request validation
│   │   ├── code.js          # Authorization code generation/use
│   │   ├── client-auth.js   # OAuth client authentication
│   │   ├── tokens.js        # ID/access/refresh token issuance (RS256)
│   │   └── rate-limit.js    # Token endpoint rate limiter
│   └── models/
│       ├── User.js           # User schema (name, email, password, role)
│       ├── Mailbox.js        # Mailbox schema (owner, shared, expiry)
│       ├── IncomingEmail.js  # Email schema (from, to, subject, body, attachments)
│       ├── Domain.js         # Domain schema (DNS verification, websiteStatus, isSystemDomain)
│       ├── Notification.js   # In-app notifications schema
│       ├── OAuthClient.js    # Registered OIDC client apps
│       ├── AuthorizationCode.js  # Short-lived auth codes (TTL)
│       ├── OIDCToken.js      # Hashed access/refresh tokens
│       └── UserConsent.js    # Per-user, per-client consent records
├── smtp-server/
│   └── smtp.js              # Standalone SMTP + Socket.io server
├── scripts/
│   ├── seed-admin.js        # First admin user seeder
│   ├── generate-rsa-keys.js # Generate OIDC RSA signing keys
│   ├── setup.sh             # One-command full server setup
│   └── deploy.sh            # Quick redeploy (pull, build, restart)
├── ecosystem.config.js      # PM2 process configuration
├── Caddyfile                # Caddy reverse proxy + On-Demand TLS config
├── middleware.js             # Security headers, CSP, request tracing
├── next.config.js           # Next.js optimizations
├── tailwind.config.js       # Tailwind extended config
├── .env.local               # Local environment variables
├── .env.production          # Production environment variables
└── .github/
    └── workflows/
        └── deploy.yml        # CI/CD pipeline
```

---

## Local Development Setup

```bash
# 1. Clone
git clone https://github.com/your-username/mailbox.git
cd mailbox

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.local.example .env.local
# Edit .env.local with your values (see Environment Variables section)

# 4. Generate OIDC signing keys (for Sign in with Mailbox)
npm run generate-keys
# Copy the printed OIDC_RSA_PRIVATE_KEY / OIDC_RSA_PUBLIC_KEY into .env.local

# 5. Seed admin user
npm run seed

# 6. Start development server
npm run dev            # Next.js on http://localhost:3000

# 7. Start SMTP server (separate terminal, requires root/port 25 access)
sudo npm run smtp      # SMTP on port 25, Socket.io on port 4000
```

## Environment Variables

Create `.env.local` (for local dev) and `.env.production` (for VPS):

```env
# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://your_user:your_password@cluster0.xxxxx.mongodb.net/your_db_name?appName=Cluster0

# NextAuth - JWT signing secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-random-secret-at-least-32-chars

# NextAuth - Full public URL of the app
NEXTAUTH_URL=https://yourdomain.com                    # Production
# NEXTAUTH_URL=http://localhost:3000                    # Local dev

# SMTP server port (must be 25 for receiving emails from external servers)
SMTP_PORT=25

# Hostname that MX records point to
MAIL_SERVER_HOSTNAME=mail.yourdomain.com

# Socket.io server port (runs inside smtp.js process)
SOCKET_PORT=4000

# Public Socket.io URL (browser connects here — same domain, proxied by Caddy)
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com
# NEXT_PUBLIC_SOCKET_URL=http://localhost:4000           # Local dev

# ─── OIDC Identity Provider (Sign in with Mailbox) ───
# Base64-encoded RSA key pair (PEM) used to sign ID tokens (RS256).
# Generate with: npm run generate-keys   (then paste the output values here)
OIDC_RSA_PRIVATE_KEY=base64-encoded-pem-private-key
OIDC_RSA_PUBLIC_KEY=base64-encoded-pem-public-key

# Canonical issuer URL — must stay constant across all custom domains.
OIDC_ISSUER_URL=https://yourdomain.com
# OIDC_ISSUER_URL=http://localhost:3000                  # Local dev
```

> **Note:** `.env.local` and `.env.production` are gitignored. Never commit real credentials.
> A committed template lives at [`.env.local.example`](.env.local.example) — copy it (`cp .env.local.example .env.local`) and fill in your values.
> The VPS setup script (`scripts/vps-setup-genuinesoftmart.sh`) auto-generates the OIDC keys on first run and reuses them on subsequent runs.

### Outbound Email (Send-Email Feature)

Outbound sending (compose, reply, forward) works **out of the box with no relay account** — by
default it delivers straight to the recipient's mail server (direct-to-MX). A relay is optional for
better deliverability. The full template is in [`.env.local.example`](.env.local.example).

```env
# Delivery mode: auto (default) | direct | relay | disabled
#   auto    = use the relay below if set, else deliver direct-to-MX (no relay)
#   direct  = always deliver straight to the recipient's mail server
#   relay   = always use the SMTP relay below
#   disabled= turn outbound sending off (send API returns 503)
OUTBOUND_MODE=auto

# Public IP of this server — used for SPF + website-hosting A records in the domain guide
SERVER_PUBLIC_IP=YOUR_VPS_IP
HOSTING_SERVER_IP=YOUR_VPS_IP

# ─── Optional SMTP relay (only used in auto/relay mode) ───
SMTP_RELAY_HOST=                # leave blank to send direct-to-MX
SMTP_RELAY_PORT=587             # 587 (STARTTLS) or 465 (implicit TLS)
SMTP_RELAY_USER=                # relay auth username (if required)
SMTP_RELAY_PASS=                # relay auth password (if required)
SMTP_RELAY_SECURE=false         # "true" for implicit TLS (465), else STARTTLS

# ─── DKIM signing (auto-generated by the VPS setup script) ───
DKIM_DOMAIN=yourdomain.com      # your sending domain
DKIM_SELECTOR=mail              # DNS host becomes <selector>._domainkey
DKIM_PRIVATE_KEY=               # base64-encoded PEM (auto-generated; never share)

# ─── Internal emit bridge (real-time send status) ───
INTERNAL_EMIT_SECRET=random-shared-secret  # shared by both processes
INTERNAL_EMIT_PORT=4001                     # localhost emit-bridge port (default 4001)

# ─── Send rate limiting ───
SEND_RATE_USER_MAX=50          # max sends per user per window (default 50)
SEND_RATE_MAILBOX_MAX=100      # max sends per mailbox per window (default 100)
SEND_RATE_WINDOW_MS=3600000    # rate window in ms (default 1 hour)
```

| Env key | Purpose | Consumed by |
|---|---|---|
| `OUTBOUND_MODE` | `auto` / `direct` / `relay` / `disabled` (default `auto`) | Next.js |
| `SERVER_PUBLIC_IP` / `HOSTING_SERVER_IP` | Server IP for SPF + hosting A records in the domain guide | Next.js |
| `SMTP_RELAY_HOST` | Optional relay hostname (blank = direct-to-MX) | Next.js |
| `SMTP_RELAY_PORT` | Relay port (587 STARTTLS / 465 TLS) | Next.js |
| `SMTP_RELAY_USER` / `SMTP_RELAY_PASS` | Relay auth (if required) | Next.js |
| `SMTP_RELAY_SECURE` | `true` for implicit TLS (465), else STARTTLS | Next.js |
| `DKIM_DOMAIN` / `DKIM_SELECTOR` / `DKIM_PRIVATE_KEY` | DKIM signing (auto-generated by setup) | Next.js |
| `INTERNAL_EMIT_SECRET` / `INTERNAL_EMIT_PORT` | Localhost emit bridge for real-time send status | Both (Next.js + smtp-server) |
| `SEND_RATE_USER_MAX` / `SEND_RATE_MAILBOX_MAX` / `SEND_RATE_WINDOW_MS` | Per-user / per-mailbox rate limits | Next.js |

- **No relay needed.** With `OUTBOUND_MODE=auto` (default) and no relay set, mail is delivered
  directly to the recipient's MX server. Set the relay variables only if you want to route through a
  provider (SES, Postmark, Mailgun, …) for better deliverability.
- **DKIM is auto-generated.** The VPS setup script generates a DKIM key and prints the DNS TXT
  record to publish. The same key is shown in each user's domain setup guide.
- **Emit bridge spans both processes.** The Socket.io server runs inside the `smtp-server` process,
  so the Next.js send route reports `sent`/`failed` over a localhost-only, secret-gated HTTP channel.
  Use the **same** `INTERNAL_EMIT_SECRET` and `INTERNAL_EMIT_PORT` in both process environments.
- **Rate limits are per process instance** (in-memory). Behind multiple Next.js instances, use a
  shared store (e.g. Redis) for a global limit.

> **⚠️ Deliverability — publish SPF / DKIM / DMARC + PTR.**
> Sending works without them, but to land in the **inbox** (not spam) you must add the DNS records
> shown in each domain's setup guide: **SPF** (authorizes this server), **DKIM** (signs your mail),
> **DMARC** (handling policy), and ask your VPS host to set **PTR** (reverse DNS) for the server IP to
> your `MAIL_SERVER_HOSTNAME`. Some VPS providers also block outbound port 25 — if so, configure a
> relay instead.

---

## Domain Configuration & DNS Setup (User Approval Flow)

Any user can request to use their own domain on the platform. An admin approves it once (a **single
approval** unlocks everything), and the user gets a complete DNS setup guide.

### Lifecycle

1. **User adds a domain** (`/api/user/domains`) — starts `private`, `verificationStatus: pending`.
2. **User requests configuration** — the domain's `websiteStatus` becomes `pending`.
3. **Admin approves** in **`/admin/domains`** → **Approve**. This single approval:
   - sets `websiteStatus: approved`,
   - sends the user an in-app notification linking to the setup guide,
   - makes the domain eligible for On-Demand TLS (website hosting).
4. **User opens the setup guide** at `/dashboard/domains/<id>/hosting` and gets every DNS record:

   | Group | Records | Why |
   |---|---|---|
   | **Step 1 — Verify ownership (required)** | `MX → mail.yourdomain.com`, `TXT mailbox-verify=<token>` | Receive email + prove ownership |
   | **Step 2 — Email sending (recommended)** | `TXT SPF`, `TXT DKIM (mail._domainkey)`, `TXT DMARC (_dmarc)` | Inbox deliverability for outgoing mail |
   | **Step 3 — Website hosting (optional)** | `A @`, `A www` → server IP | Serve a website on the domain |
   | **PTR** | reverse DNS → `MAIL_SERVER_HOSTNAME` | Set at the VPS host, not the registrar |

   Each record has a one-click **Copy** button, a plain-language purpose, and where to add it. A
   **Verify now** button runs DNS verification on the spot.
5. **Verified → use it** — the user creates mailboxes on the domain and sends/receives mail.

> The DNS values (SPF IP, DKIM public key, MX host) are derived server-side from your env
> (`SERVER_PUBLIC_IP`, `DKIM_PRIVATE_KEY`, `MAIL_SERVER_HOSTNAME`), so what the user sees always
> matches what the server actually signs and routes with.

---

## Quick Auto-Setup (Recommended)

One command to set up everything on a fresh **Ubuntu 22.04/24.04** VPS — Node.js, Caddy, PM2, build, and start. Caddy handles HTTPS automatically — no Certbot, no manual SSL setup.

### Step 1: Clone the repo

```bash
ssh root@YOUR_VPS_IP
git clone https://github.com/your-username/mailbox.git /var/www/mailbox-saas
cd /var/www/mailbox-saas
```

### Step 2: Configure environment

```bash
nano .env.local
```

Minimum required values:

```env
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/mailbox

# NextAuth
NEXTAUTH_SECRET=your-random-secret-string
NEXTAUTH_URL=https://yourdomain.com

# SMTP
SMTP_PORT=25
MAIL_SERVER_HOSTNAME=mail.yourdomain.com

# Socket.io
SOCKET_PORT=4000
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com

# Domain (used by setup script for Caddyfile)
DOMAIN=yourdomain.com
```

### Step 3: Run setup

```bash
sudo bash scripts/setup.sh
```

**This single command will automatically:**

| Step | What it does |
|---|---|
| 1 | Install Node.js 20, Caddy, PM2, Git |
| 2 | Install npm dependencies |
| 3 | Build the Next.js production bundle |
| 4 | Generate & install Caddyfile (reads domain from `.env.local`) |
| 5 | Caddy automatically obtains SSL certs (no Certbot needed) |
| 6 | Create PM2 ecosystem config |
| 7 | Start Next.js web app + SMTP server via PM2 |
| 8 | Enable PM2 startup on reboot |
| 9 | Configure firewall (ports 80, 443, 25, 22) |

### Step 4: Seed admin user

```bash
npm run seed
# Admin created -> admin@mailbox.local / password: admin123
```

> **Change the admin password immediately after first login!**

### Redeployment (after code updates)

Whenever you push new code, just run:

```bash
sudo bash scripts/deploy.sh
```

This will: `git pull` → `npm install` → `npm run build` → `pm2 restart` → `caddy reload`

Or equivalently:

```bash
npm run deploy
```

### Re-running setup

The setup script is **idempotent** — safe to run multiple times. It won't break existing config, just updates everything to the latest state.

---

## VPS Production Setup (Step-by-Step)

> **Prefer the [Quick Auto-Setup](#quick-auto-setup-recommended) above.** The manual steps below are for reference or if you need granular control.

This guide assumes a fresh **Ubuntu 22.04/24.04** VPS with root access.

### 1. Server Preparation

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Update system
apt update && apt upgrade -y

# Install essential tools
apt install -y curl git ufw debian-keyring debian-archive-keyring apt-transport-https

# Configure firewall
ufw allow OpenSSH
ufw allow 80/tcp       # HTTP (Caddy + ACME challenge)
ufw allow 443/tcp      # HTTPS
ufw allow 443/udp      # HTTP/3 (QUIC)
ufw allow 25/tcp       # SMTP (incoming email)
ufw enable

# Verify
ufw status
```

### 2. Install Node.js (via NVM)

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load NVM (or re-login)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js LTS
nvm install --lts
nvm use --lts
nvm alias default node

# Verify
node -v    # e.g., v20.x.x
npm -v     # e.g., 10.x.x
```

### 3. Install PM2

```bash
npm install -g pm2

# (Optional) Enable PM2 startup on reboot
pm2 startup systemd
# Run the command it outputs, e.g.:
# sudo env PATH=$PATH:/root/.nvm/versions/node/v20.x.x/bin pm2 startup systemd -u root --hp /root
```

### 4. Install & Configure Caddy

Caddy is a modern reverse proxy with **automatic HTTPS** built in. It obtains and renews Let's Encrypt certs by itself — no Certbot needed. It also supports **On-Demand TLS** for white-label custom domains (provisioning certs on first request).

```bash
# Add the official Caddy apt repo
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list

apt update
apt install -y caddy

# Verify
caddy version
systemctl status caddy
```

Caddy is installed as a systemd service and runs as the `caddy` user. Config lives at `/etc/caddy/Caddyfile`.

### 5. Clone the Repository

```bash
mkdir -p /var/www
cd /var/www

# Clone your repo
git clone https://github.com/your-username/mailbox.git mailbox-saas
cd mailbox-saas
```

### 6. Configure Environment Variables

```bash
# Create production environment file
nano .env.local
```

Paste your production config (see [Environment Variables](#environment-variables) section above), then:

```bash
# Also create .env.production with the same values
cp .env.local .env.production
```

### 7. Install Dependencies & Build

```bash
cd /var/www/mailbox-saas

# Install all dependencies
npm ci --production=false

# Build the Next.js app
npm run build
```

> If build succeeds, you'll see a summary of all routes. If it fails, check for missing environment variables.

### 8. Seed Admin User

```bash
npm run seed
# Output: Admin created -> admin@mailbox.local / password: admin123
```

> **Important:** Change the admin password immediately after first login!

The seed script is in `scripts/seed-admin.js`. It creates:
- **Email:** `admin@mailbox.local`
- **Password:** `admin123`
- **Role:** `admin`

### 9. Start Services with PM2

```bash
# Start all services using the ecosystem config
pm2 start ecosystem.config.js

# Save process list (survives reboot)
pm2 save

# Verify both are running
pm2 status
```

Expected output:

```
┌─────────────┬────┬─────────┬────────┐
│ Name        │ id │ status  │ cpu    │
├─────────────┼────┼─────────┼────────┤
│ mailbox-web │ 0  │ online  │ 0%     │
│ mailbox-smtp│ 1  │ online  │ 0%     │
└─────────────┴────┴─────────┴────────┘
```

**Ports in use:**
| Service | Port | Purpose |
|---|---|---|
| Next.js | 3000 | Web app (proxied by Caddy) |
| SMTP | 25 | Receives incoming emails |
| Socket.io | 4000 | Real-time WebSocket (proxied by Caddy at `/socket.io/`) |
| Caddy | 80/443 | Reverse proxy + automatic SSL |

### 10. Caddyfile (HTTPS + Custom Domains)

Edit `/etc/caddy/Caddyfile`:

```bash
nano /etc/caddy/Caddyfile
```

Paste this configuration (replace `yourdomain.com` with your actual domain):

```caddy
{
    # On-Demand TLS approval endpoint — Caddy asks the app whether to issue
    # a cert for an arbitrary hostname (used for white-label custom domains).
    on_demand_tls {
        ask http://127.0.0.1:3000/api/public/verify-domain
    }
}

# 1) Specific route for the main domain (always-on TLS)
yourdomain.com, www.yourdomain.com {
    reverse_proxy 127.0.0.1:3000

    # Socket.io routing
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:4000
    }
}

# 2) Catch-all for On-Demand TLS custom domains
#    Any other hostname pointed at this server gets a cert auto-issued
#    after the /api/public/verify-domain endpoint approves it.
https:// {
    tls {
        on_demand
    }

    reverse_proxy 127.0.0.1:3000

    # Socket.io routing for custom domains
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:4000
    }
}
```

Validate, format, and reload:

```bash
# Validate syntax
caddy validate --config /etc/caddy/Caddyfile

# Format the file in place (optional, makes it canonical)
caddy fmt --overwrite /etc/caddy/Caddyfile

# Reload Caddy (zero-downtime)
systemctl reload caddy

# Or full restart if reload fails
systemctl restart caddy

# Watch logs to confirm cert issuance
journalctl -u caddy -f
```

That's it — Caddy will automatically obtain a Let's Encrypt cert for your main domain on first request. No Certbot, no manual renewal. Certs auto-renew in the background.

---

## DNS Configuration

Point your domain to the VPS and configure email receiving:

### A. Domain DNS Records

| Type | Name | Value | TTL |
|---|---|---|---|
| **A** | `@` | `YOUR_VPS_IP` | 300 |
| **A** | `www` | `YOUR_VPS_IP` | 300 |
| **A** | `mail` | `YOUR_VPS_IP` | 300 |
| **MX** | `@` | `mail.yourdomain.com` (Priority: 10) | 300 |

### B. User Custom Domain DNS Records

When users add their own domain (e.g., `customdomain.com`), they need to configure:

| Type | Name | Value | TTL |
|---|---|---|---|
| **A** | `@` | `YOUR_VPS_IP` | 300 |
| **MX** | `@` | `mail.yourdomain.com` (Priority: 10) | 300 |
| **TXT** | `@` | `mailbox-verify=<token>` (provided by the app) | 300 |

The platform verifies both MX and TXT records before activating the domain. Once verified, Caddy auto-issues an HTTPS cert for the user's domain on first browser request.

---

## White-Label Custom Domains (On-Demand TLS)

Caddy's killer feature for this app: **a user adds their own domain, points DNS at your server, and HTTPS just works** — no manual cert provisioning.

### How it works

1. User adds `customdomain.com` in your dashboard, app stores it in MongoDB after MX/TXT verification.
2. User points an `A` record at your VPS.
3. A browser hits `https://customdomain.com`.
4. Caddy doesn't have a cert yet, so it calls the **`ask` endpoint**: `GET http://127.0.0.1:3000/api/public/verify-domain?domain=customdomain.com`.
5. Your Next.js app checks the database — is this domain verified and approved? Returns `200 OK` (approve) or any non-2xx (reject).
6. If approved, Caddy obtains a Let's Encrypt cert, caches it, and serves the site.
7. On future requests, Caddy uses the cached cert (auto-renewing in the background).

### What you need

- **`/api/public/verify-domain`** route in your Next.js app — must return `200` for approved domains, non-2xx otherwise. Already implemented in [app/api/public/verify-domain/](app/api/public/verify-domain/).
- The catch-all `https://` block in your Caddyfile (shown in [Section 10](#10-caddyfile-https--custom-domains)).
- The global `on_demand_tls { ask ... }` directive (also in Section 10).

### NextAuth across custom domains

NextAuth normally locks to a single `NEXTAUTH_URL`. To make login work across arbitrary user domains, the auth route updates `process.env.NEXTAUTH_URL` per-request based on the incoming `Host` header. See [app/api/auth/[...nextauth]/route.js](app/api/auth/[...nextauth]/route.js).

### Rate limiting & abuse protection

Caddy will refuse to issue a cert if the `ask` endpoint says no — so make sure that endpoint is strict. Don't let unverified domains through. Let's Encrypt rate-limits issuance to ~50 certs per registered domain per week, which can be hit by a malicious user listing thousands of fake domains.

---

## OIDC Identity Provider (Sign in with Mailbox)

The platform is a full **OpenID Connect (OIDC) Identity Provider**. Any standards-compliant relying party — ChatGPT Teams/Enterprise custom SSO, Slack, Notion, or your own apps — can offer **"Sign in with Mailbox"** so users authenticate with their Mailbox credentials.

### Endpoints

| Endpoint | Path | Purpose |
|---|---|---|
| Discovery | `/.well-known/openid-configuration` | Provider metadata (auto-config for clients) |
| JWKS | `/.well-known/jwks.json` | Public RSA keys for ID-token verification |
| Authorization | `/api/oidc/authorize` | Starts login + consent flow |
| Token | `/api/oidc/token` | Exchanges code for tokens; refresh-token grant |
| UserInfo | `/api/oidc/userinfo` | Returns claims for an access token |
| Revocation | `/api/oidc/revoke` | Invalidates tokens |

### Supported capabilities

- **Authorization Code flow** with **PKCE** (S256) — required for public clients
- **ID tokens** signed with **RS256**; opaque access/refresh tokens stored hashed
- **Scopes:** `openid`, `profile`, `email`, `offline_access`
- **Refresh-token rotation** with reuse detection (revokes all tokens on reuse)
- **Consent screen** with per-user, per-client consent records and revocation
- **Rate limiting** — 20 token requests/min per client
- Works across white-label custom domains (issuer stays constant via `OIDC_ISSUER_URL`)

### Generate signing keys

```bash
npm run generate-keys
# Paste OIDC_RSA_PRIVATE_KEY, OIDC_RSA_PUBLIC_KEY, OIDC_ISSUER_URL into .env.local
```

> On a VPS, `scripts/vps-setup-genuinesoftmart.sh` generates and installs these keys automatically (and preserves them on re-run).

### Register a client application

1. Sign in as an admin and open **`/admin/oauth-clients`**.
2. Click **Register New Client**, set a display name, redirect URI(s), allowed scopes, and client type (`confidential` for server apps, `public` for SPAs/mobile).
3. Copy the generated **Client ID** and **Client Secret** (the secret is shown only once).

### Configure the relying party

Point the external service at the discovery URL and provide the credentials:

- **Issuer / Discovery URL:** `https://yourdomain.com/.well-known/openid-configuration`
- **Client ID / Client Secret:** from the admin panel
- **Redirect URI:** the callback URL registered for that client
- **Scopes:** `openid profile email`

Users can review and revoke connected apps under **Dashboard → Settings → Authorized applications**. Admins can revoke any authorization from `/admin/oauth-clients`.

---

## GitHub Actions CI/CD

Pushes to `main` branch auto-deploy via `.github/workflows/deploy.yml`.

### Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Description | Example |
|---|---|---|
| `VPS_HOST` | VPS IP address | `123.45.67.89` |
| `VPS_USER` | SSH username | `root` |
| `VPS_SSH_KEY` | Private SSH key (full content) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

### How to set up SSH key auth

```bash
# On your LOCAL machine, generate a key pair:
ssh-keygen -t ed25519 -C "deploy-key" -f ~/.ssh/mailbox_deploy

# Copy the PUBLIC key to the VPS:
ssh-copy-id -i ~/.ssh/mailbox_deploy.pub root@YOUR_VPS_IP

# The PRIVATE key content (~/.ssh/mailbox_deploy) goes into GitHub secret VPS_SSH_KEY
cat ~/.ssh/mailbox_deploy
# Copy the entire output including the BEGIN/END lines
```

### CI/CD Pipeline Flow

```
Push to main → GitHub Actions → SSH into VPS →
  git pull → npm ci → npm run build → pm2 restart all → systemctl reload caddy
```

---

## Admin Panel

Access admin features at `/admin` (requires admin role).

### Pages

| Route | Description |
|---|---|
| `/admin` | Dashboard — Overview stats, email activity, system info, memory, top mailboxes, recent users & emails |
| `/admin/users` | User Management — Search, paginate, promote/demote role, reset password, delete user (cascade deletes all their data) |
| `/admin/domains` | Domain Management — Add/remove system domains; verify DNS; **approve user domain requests** (single approval that unlocks the user's DNS setup guide + hosting) |
| `/admin/oauth-clients` | OAuth Clients — Register/edit/delete OIDC SSO clients, regenerate secrets, view & revoke active user authorizations |
| `/admin/monitor` | Server Monitor — Real-time CPU load (gauge charts), memory bars, Node.js process memory, DB storage stats, email volume & user growth charts. Auto-refreshes every 15 seconds |

### Admin API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/stats` | GET | Platform stats, system info, charts data |
| `/api/admin/users` | GET | List users (search, pagination) |
| `/api/admin/users` | PATCH | Toggle role or reset password |
| `/api/admin/users` | DELETE | Delete user + cascade all data |
| `/api/admin/domains` | GET/POST/DELETE | Manage system domains |
| `/api/admin/oauth-clients` | GET/POST | List / register OIDC OAuth clients |
| `/api/admin/oauth-clients/[id]` | GET/PATCH/DELETE | Client detail / update / deactivate |
| `/api/admin/oauth-clients/[id]/regenerate-secret` | POST | Rotate a client secret |
| `/api/admin/oauth-clients/authorizations` | GET/DELETE | List / revoke user authorizations |

---

## SMTP Server Details

The custom SMTP server (`smtp-server/smtp.js`) is a standalone Node.js process that:

1. **Listens on port 25** for incoming SMTP connections
2. **Validates recipients** — only accepts emails for active mailboxes in the database
3. **Parses emails** — extracts subject, HTML/text body, and attachments using `mailparser`
4. **Saves to MongoDB** — stores in the `IncomingEmail` collection
5. **Emits real-time events** — via Socket.io to connected browser clients
6. **Auto-cleans expired mailboxes** — checks every 60 seconds and deletes expired mailboxes + their emails
7. **Graceful shutdown** — handles SIGTERM/SIGINT for clean process restarts

Config:
- Max concurrent connections: 100
- Max message size: 25 MB
- No authentication required (receive-only)
- STARTTLS disabled (Caddy is the public TLS terminator; SMTP runs on port 25 plaintext for inbound mail, which is the standard)

## Socket.io Real-time

Socket.io runs inside the SMTP server process on port 4000.

**Events:**

| Event | Direction | Description |
|---|---|---|
| `join-mailbox` | Client → Server | Subscribe to a specific mailbox's emails |
| `leave-mailbox` | Client → Server | Unsubscribe from a mailbox |
| `join-dashboard` | Client → Server | Subscribe to dashboard updates for a user |
| `leave-dashboard` | Client → Server | Unsubscribe from dashboard |
| `new-email` | Server → Client | New email received in a mailbox |
| `dashboard-new-email` | Server → Client | New email notification for dashboard |

In production, Socket.io is proxied through Caddy at the `/socket.io/*` path (handled by the `handle` block in the Caddyfile). The browser connects to the same domain over HTTPS — Caddy handles the WebSocket upgrade transparently. No special config is needed; `reverse_proxy` in Caddy supports WebSockets out of the box.

---

## Security

The application implements multiple security layers:

| Feature | Implementation |
|---|---|
| **CSP** | Content-Security-Policy header via middleware |
| **HSTS** | Strict-Transport-Security (2 years, preload) |
| **XSS** | X-XSS-Protection + input sanitization utility |
| **Clickjacking** | X-Frame-Options: DENY |
| **MIME Sniffing** | X-Content-Type-Options: nosniff |
| **Rate Limiting** | Per-IP rate limiter on API routes |
| **Input Sanitization** | Custom sanitize utility for user inputs |
| **Auth** | JWT tokens, bcrypt password hashing (12 rounds) |
| **Request Tracing** | Unique X-Request-Id on every request |
| **No Fingerprinting** | X-Powered-By & Server headers removed |
| **TLS** | Caddy serves modern TLS (1.2/1.3) by default with strong ciphers |

---

## Useful PM2 & Caddy Commands

### PM2

```bash
pm2 status                    # List all processes
pm2 logs                      # Live logs (all processes)
pm2 logs mailbox-web          # Logs for web app only
pm2 logs mailbox-smtp         # Logs for SMTP only
pm2 restart all               # Restart everything
pm2 restart mailbox-web       # Restart web only
pm2 restart mailbox-smtp      # Restart SMTP only
pm2 stop all                  # Stop all
pm2 delete all                # Remove all processes
pm2 monit                     # Real-time monitoring dashboard
pm2 save                      # Save process list for reboot
```

### Caddy

```bash
# Service management
systemctl status caddy        # Service status
systemctl reload caddy        # Reload config (zero-downtime)
systemctl restart caddy       # Full restart
systemctl enable caddy        # Auto-start on boot

# Config
caddy validate --config /etc/caddy/Caddyfile     # Validate syntax
caddy fmt --overwrite /etc/caddy/Caddyfile        # Format Caddyfile
caddy reload --config /etc/caddy/Caddyfile        # Reload (alternative to systemctl reload)

# Logs
journalctl -u caddy -f         # Live logs
journalctl -u caddy --since "10 min ago"
journalctl -u caddy | grep -i error

# Cert inspection
ls /var/lib/caddy/.local/share/caddy/certificates/  # Stored certs
caddy list-certs               # If you have caddy admin enabled
```

---

## Troubleshooting

### Build fails with "Dynamic server usage" error
Add `export const dynamic = "force-dynamic";` at the top of the affected API route file. This is needed for routes that use `getServerSession` (which reads headers).

### Build fails with `sh: 1: next: not found`
The shell's `PATH` may not be exported to npm scripts. Either run:

```bash
echo 'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"' >> /root/.bashrc
source /root/.bashrc
```

…or run npm directly with PATH inline:

```bash
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH" npm run build
```

The `scripts/deploy.sh` already exports PATH explicitly to avoid this.

### SMTP not receiving emails
```bash
# Check if port 25 is open
telnet YOUR_VPS_IP 25

# Check firewall
ufw status

# Check PM2 logs
pm2 logs mailbox-smtp

# Many cloud providers block port 25 by default.
# You may need to open a support ticket to unblock it.
```

### Socket.io not connecting
- Ensure the Caddyfile has the `handle /socket.io/*` block proxying to `127.0.0.1:4000`
- Check that `NEXT_PUBLIC_SOCKET_URL` matches your production domain (and is HTTPS)
- Check PM2 logs: `pm2 logs mailbox-smtp`
- Caddy logs: `journalctl -u caddy -f`

### Caddy port conflict (Address already in use)
Something else (often a stale nginx) is bound to ports 80/443. Find and stop it:

```bash
ss -tlnp | grep -E ':80 |:443 '
lsof -i :80
systemctl stop nginx 2>/dev/null
systemctl disable nginx 2>/dev/null
systemctl restart caddy
```

### Caddy 502 / Bad Gateway
```bash
# Check if Next.js is running
pm2 status

# If stopped, restart
pm2 restart mailbox-web

# Tail Caddy logs
journalctl -u caddy -f
```

### Cert not being issued for custom domain (On-Demand TLS)
1. Confirm the user's `A` record actually points at your VPS: `dig +short customdomain.com`
2. Confirm `/api/public/verify-domain?domain=customdomain.com` returns `200` for an approved domain. Test:
   ```bash
   curl -i "http://127.0.0.1:3000/api/public/verify-domain?domain=customdomain.com"
   ```
3. Watch Caddy logs while triggering the request: `journalctl -u caddy -f`
4. Check Let's Encrypt rate limits — you can hit them if the `ask` endpoint is too permissive.

### Domain verification failing (MX/TXT)
- DNS propagation can take up to 48 hours
- Use `dig MX yourdomain.com` to verify MX records
- Use `dig TXT yourdomain.com` to verify TXT records
- The MX record must point to your `MAIL_SERVER_HOSTNAME`

### Caddy not auto-renewing certs
Caddy renews automatically when certs are within 30 days of expiry. To force a check:

```bash
systemctl restart caddy
journalctl -u caddy --since "5 min ago" | grep -i renew
```

Stored certs live under `/var/lib/caddy/.local/share/caddy/certificates/`.

---

## License

MIT
