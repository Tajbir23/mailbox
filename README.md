# MailboxSaaS

Self-hosted, receive-only email SaaS platform built with **Next.js 14**, a custom **SMTP server**, **MongoDB Atlas**, **NextAuth**, and **Socket.io** for real-time email delivery.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Local Development Setup](#local-development-setup)
5. [Environment Variables](#environment-variables)
6. [VPS Production Setup (Step-by-Step)](#vps-production-setup-step-by-step)
   - [1. Server Preparation](#1-server-preparation)
   - [2. Install Node.js (via NVM)](#2-install-nodejs-via-nvm)
   - [3. Install PM2](#3-install-pm2)
   - [4. Install & Configure Nginx](#4-install--configure-nginx)
   - [5. Clone the Repository](#5-clone-the-repository)
   - [6. Configure Environment Variables](#6-configure-environment-variables)
   - [7. Install Dependencies & Build](#7-install-dependencies--build)
   - [8. Seed Admin User](#8-seed-admin-user)
   - [9. Start Services with PM2](#9-start-services-with-pm2)
   - [10. SSL Certificate (Let's Encrypt)](#10-ssl-certificate-lets-encrypt)
   - [11. Update Nginx for HTTPS](#11-update-nginx-for-https)
7. [DNS Configuration](#dns-configuration)
8. [GitHub Actions CI/CD](#github-actions-cicd)
9. [Admin Panel](#admin-panel)
10. [SMTP Server Details](#smtp-server-details)
11. [Socket.io Real-time](#socketio-real-time)
12. [Security](#security)
13. [Useful PM2 Commands](#useful-pm2-commands)
14. [Troubleshooting](#troubleshooting)
15. [License](#license)

---

## Features

- **Custom Domains** — Add your own domains with MX + TXT DNS verification
- **Real-Time Inbox** — Emails arrive instantly via WebSocket (Socket.io)
- **Team Sharing** — Share mailboxes with team members
- **Mailbox Management** — Create, transfer ownership, set auto-expiry, delete
- **Admin Panel** — Dashboard overview, user management (promote/demote/reset password/delete), domain management, server monitoring (CPU, RAM, storage, email volume charts)
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
| **Reverse Proxy** | Nginx |
| **SSL** | Let's Encrypt (Certbot) |
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
│   └── models/
│       ├── User.js           # User schema (name, email, password, role)
│       ├── Mailbox.js        # Mailbox schema (owner, shared, expiry)
│       ├── IncomingEmail.js  # Email schema (from, to, subject, body, attachments)
│       └── Domain.js         # Domain schema (DNS verification, isSystemDomain)
├── smtp-server/
│   └── smtp.js              # Standalone SMTP + Socket.io server
├── scripts/
│   └── seed-admin.js        # First admin user seeder
├── nginx-mailbox.conf       # Nginx site configuration (reference)
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

# 4. Seed admin user
npm run seed

# 5. Start development server
npm run dev            # Next.js on http://localhost:3000

# 6. Start SMTP server (separate terminal, requires root/port 25 access)
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

# Public Socket.io URL (browser connects here)
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com           # Production (proxied by Nginx)
# NEXT_PUBLIC_SOCKET_URL=http://localhost:4000           # Local dev
```

> **Note:** `.env.local` and `.env.production` are gitignored. Never commit real credentials.

---

## VPS Production Setup (Step-by-Step)

This guide assumes a fresh **Ubuntu 22.04/24.04** VPS with root access.

### 1. Server Preparation

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Update system
apt update && apt upgrade -y

# Install essential tools
apt install -y curl git ufw

# Configure firewall
ufw allow OpenSSH
ufw allow 80/tcp       # HTTP
ufw allow 443/tcp      # HTTPS
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

### 4. Install & Configure Nginx

```bash
# Install Nginx
apt install -y nginx

# Create site config
nano /etc/nginx/sites-available/mailbox
```

Paste this Nginx config:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Next.js app (port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.io WebSocket (port 4000)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 25M;
}
```

Enable the site:

```bash
# Enable site & remove default
ln -s /etc/nginx/sites-available/mailbox /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test & reload
nginx -t
systemctl reload nginx
```

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
# Start Next.js web server
pm2 start npm --name "mailbox-web" -- start

# Start SMTP + Socket.io server
pm2 start smtp-server/smtp.js --name "mailbox-smtp"

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
| Next.js | 3000 | Web app (proxied by Nginx) |
| SMTP | 25 | Receives incoming emails |
| Socket.io | 4000 | Real-time WebSocket (proxied by Nginx) |
| Nginx | 80/443 | Reverse proxy + SSL termination |

### 10. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Obtain certificate (auto-configures Nginx)
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow prompts:
# - Enter email for renewal notices
# - Agree to ToS
# - Choose redirect HTTP→HTTPS (recommended)

# Verify auto-renewal
certbot renew --dry-run
```

### 11. Update Nginx for HTTPS

Certbot auto-modifies your Nginx config to add the SSL block. After running certbot, verify:

```bash
nginx -t
systemctl reload nginx
```

Your site should now be accessible at `https://yourdomain.com`.

Make sure your `.env.production` uses HTTPS URLs:

```env
NEXTAUTH_URL=https://yourdomain.com
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com
```

Then rebuild and restart:

```bash
cd /var/www/mailbox-saas
npm run build
pm2 restart all
```

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
| **MX** | `@` | `mail.yourdomain.com` (Priority: 10) | 300 |
| **TXT** | `@` | `mailbox-verify=<token>` (provided by the app) | 300 |

The platform verifies both MX and TXT records before activating the domain.

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
  git pull → npm ci → npm run build → pm2 restart all
```

---

## Admin Panel

Access admin features at `/admin` (requires admin role).

### Pages

| Route | Description |
|---|---|
| `/admin` | Dashboard — Overview stats, email activity, system info, memory, top mailboxes, recent users & emails |
| `/admin/users` | User Management — Search, paginate, promote/demote role, reset password, delete user (cascade deletes all their data) |
| `/admin/domains` | Domain Management — Add/remove system domains |
| `/admin/monitor` | Server Monitor — Real-time CPU load (gauge charts), memory bars, Node.js process memory, DB storage stats, email volume & user growth charts. Auto-refreshes every 15 seconds |

### Admin API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/stats` | GET | Platform stats, system info, charts data |
| `/api/admin/users` | GET | List users (search, pagination) |
| `/api/admin/users` | PATCH | Toggle role or reset password |
| `/api/admin/users` | DELETE | Delete user + cascade all data |
| `/api/admin/domains` | GET/POST/DELETE | Manage system domains |

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
- STARTTLS disabled (Nginx handles SSL termination)

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

In production, Socket.io is proxied through Nginx at `/socket.io/` path, so the browser connects to the same domain (HTTPS) with automatic WebSocket upgrade.

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

---

## Useful PM2 Commands

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

---

## Troubleshooting

### Build fails with "Dynamic server usage" error
Add `export const dynamic = "force-dynamic";` at the top of the affected API route file. This is needed for routes that use `getServerSession` (which reads headers).

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
- Ensure Nginx has the `/socket.io/` location block with WebSocket upgrade headers
- Check that `NEXT_PUBLIC_SOCKET_URL` matches your production domain
- Check PM2 logs: `pm2 logs mailbox-smtp`

### Nginx 502 Bad Gateway
```bash
# Check if Next.js is running
pm2 status

# If stopped, restart
pm2 restart mailbox-web

# Check Nginx error log
tail -f /var/log/nginx/error.log
```

### SSL certificate renewal
```bash
# Test renewal
certbot renew --dry-run

# Force renewal
certbot renew --force-renewal

# Certbot sets up auto-renewal via systemd timer
systemctl status certbot.timer
```

### Domain verification failing
- DNS propagation can take up to 48 hours
- Use `dig MX yourdomain.com` to verify MX records
- Use `dig TXT yourdomain.com` to verify TXT records
- The MX record must point to your `MAIL_SERVER_HOSTNAME`

---

## License

MIT
