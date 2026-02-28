# MailboxSaaS

Self-hosted, receive-only email platform built with Next.js 14, custom SMTP server, MongoDB, and Socket.io.

## Features

- **Custom Domains** — Add your own domains with MX + TXT DNS verification
- **Real-Time Inbox** — Emails arrive instantly via WebSocket (Socket.io)
- **Team Sharing** — Share mailboxes with team members
- **Admin Panel** — Manage domains, users, and mailboxes
- **Security** — CSP, HSTS, rate limiting, XSS protection, input sanitization
- **SEO Optimized** — Rich metadata, JSON-LD, sitemap, robots.txt

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS 3
- **Backend**: Next.js API Routes, NextAuth 4 (JWT)
- **Database**: MongoDB (Mongoose 8)
- **Email**: Custom SMTP server (smtp-server + mailparser)
- **Real-time**: Socket.io 4
- **Deployment**: PM2, Nginx, Let's Encrypt SSL

## Getting Started

```bash
npm install
cp .env.local.example .env.local  # Configure your environment
npm run build
npm start          # Start Next.js (port 3000)
npm run smtp       # Start SMTP server (port 25)
```

## Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `NEXTAUTH_SECRET` | Random secret for JWT signing |
| `NEXTAUTH_URL` | Public URL of the app |
| `SMTP_PORT` | SMTP server port (default: 25) |
| `MAIL_SERVER_HOSTNAME` | Hostname for MX records |
| `SOCKET_PORT` | Socket.io port (default: 4000) |
| `NEXT_PUBLIC_SOCKET_URL` | Public Socket.io URL for browser |

## Deployment

Pushes to `main` branch automatically deploy to production via GitHub Actions.

## License

MIT
