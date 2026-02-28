/**
 * Standalone SMTP Server + Socket.io emitter
 *
 * Run:  npm run smtp   (or:  node smtp-server/smtp.js)
 *
 * - Listens for incoming emails on SMTP_PORT (default 25).
 * - Validates recipient against the Mailbox collection.
 * - Parses email (html, text, attachments) with mailparser.
 * - Saves to IncomingEmail collection.
 * - Emits "new-email" via Socket.io so the Next.js frontend updates in real-time.
 */

const { SMTPServer } = require("smtp-server");
const { simpleParser } = require("mailparser");
const mongoose = require("mongoose");
const { Server: SocketServer } = require("socket.io");
const http = require("http");
const path = require("path");
const fs = require("fs");

// ---- load .env.local manually ----
const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mailbox-saas";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "25", 10);
const SOCKET_PORT = parseInt(process.env.SOCKET_PORT || "4000", 10);

// ---- Mongoose schemas (CommonJS duplicates – keeps standalone) ----
const MailboxSchema = new mongoose.Schema({
  emailAddress: { type: String, unique: true, lowercase: true, trim: true },
  domainId: mongoose.Schema.Types.ObjectId,
  ownerId: mongoose.Schema.Types.ObjectId,
  sharedWith: [mongoose.Schema.Types.ObjectId],
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
});

const IncomingEmailSchema = new mongoose.Schema({
  mailboxId: { type: mongoose.Schema.Types.ObjectId, index: true },
  from: String,
  to: String,
  subject: { type: String, default: "(No Subject)" },
  bodyHtml: { type: String, default: "" },
  bodyText: { type: String, default: "" },
  isRead: { type: Boolean, default: false },
  attachments: [
    {
      filename: String,
      contentType: String,
      size: Number,
      content: Buffer,
    },
  ],
  receivedAt: { type: Date, default: Date.now },
});

let Mailbox;
let IncomingEmail;

// ---- Socket.io ----
const httpServer = http.createServer();
const io = new SocketServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log("[Socket.io] Client connected:", socket.id);

  // Clients join a room named after the mailbox id to scope events
  socket.on("join-mailbox", (mailboxId) => {
    socket.join(mailboxId);
    console.log(`[Socket.io] ${socket.id} joined room ${mailboxId}`);
  });

  // Dashboard room for real-time mailbox list updates
  socket.on("join-dashboard", (userId) => {
    socket.join(`dashboard-${userId}`);
    console.log(`[Socket.io] ${socket.id} joined dashboard-${userId}`);
  });

  socket.on("leave-dashboard", (userId) => {
    socket.leave(`dashboard-${userId}`);
  });

  socket.on("leave-mailbox", (mailboxId) => {
    socket.leave(mailboxId);
  });

  socket.on("disconnect", () => {
    console.log("[Socket.io] Client disconnected:", socket.id);
  });
});

// ---- SMTP Server ----
const smtpServer = new SMTPServer({
  // No authentication required – this is a receive-only public server
  authOptional: true,

  // Allow connections without STARTTLS for local / dev
  secure: false,
  disabledCommands: ["AUTH", "STARTTLS"],

  // ── Scalability: connection & size limits ──
  maxClients: 100,                 // Max concurrent SMTP connections
  size: 25 * 1024 * 1024,         // Max message size: 25MB
  useXClient: false,
  useXForward: false,
  hidePIPELINING: false,
  banner: "MailboxSaaS SMTP Ready",

  // Validate recipient – only accept if the mailbox exists and is active
  async onRcptTo(address, session, callback) {
    try {
      const recipient = address.address.toLowerCase();

      // Limit recipients per message to prevent abuse
      if (session.mailboxes && Object.keys(session.mailboxes).length >= 50) {
        return callback(new Error("Too many recipients"));
      }

      const mailbox = await Mailbox.findOne({
        emailAddress: recipient,
        isActive: true,
      }).lean();

      if (!mailbox) {
        console.log(`[SMTP] Rejected: ${recipient} (mailbox not found)`);
        return callback(new Error("Mailbox does not exist"));
      }

      // Stash the mailbox on the session for later use in onData
      if (!session.mailboxes) session.mailboxes = {};
      session.mailboxes[recipient] = mailbox;

      console.log(`[SMTP] Accepted recipient: ${recipient}`);
      callback();
    } catch (err) {
      console.error("[SMTP] onRcptTo error:", err);
      callback(new Error("Internal server error"));
    }
  },

  // Parse and save the incoming email
  async onData(stream, session, callback) {
    try {
      const parsed = await simpleParser(stream);

      // Process each accepted recipient
      const recipients = Object.values(session.mailboxes || {});

      for (const mailbox of recipients) {
        const attachments = (parsed.attachments || []).map((att) => ({
          filename: att.filename || "untitled",
          contentType: att.contentType || "application/octet-stream",
          size: att.size || 0,
          content: att.content,
        }));

        const email = await IncomingEmail.create({
          mailboxId: mailbox._id,
          from: parsed.from?.text || "",
          to: mailbox.emailAddress,
          subject: parsed.subject || "(No Subject)",
          bodyHtml: parsed.html || "",
          bodyText: parsed.text || "",
          attachments,
          receivedAt: new Date(),
        });

        console.log(
          `[SMTP] Saved email for ${mailbox.emailAddress} — subject: "${email.subject}"`
        );

        // Emit real-time event to clients watching this mailbox
        io.to(mailbox._id.toString()).emit("new-email", {
          _id: email._id,
          mailboxId: mailbox._id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          bodyText: email.bodyText,
          bodyHtml: email.bodyHtml,
          isRead: false,
          receivedAt: email.receivedAt,
        });

        // Emit to dashboard room for the mailbox owner + shared users
        const dashboardPayload = {
          mailboxId: mailbox._id.toString(),
          emailAddress: mailbox.emailAddress,
          lastEmail: {
            _id: email._id,
            from: email.from,
            subject: email.subject,
            receivedAt: email.receivedAt,
          },
        };
        // Notify owner
        if (mailbox.ownerId) {
          io.to(`dashboard-${mailbox.ownerId.toString()}`).emit("dashboard-new-email", dashboardPayload);
        }
        // Notify shared users
        if (mailbox.sharedWith && mailbox.sharedWith.length > 0) {
          for (const uid of mailbox.sharedWith) {
            io.to(`dashboard-${uid.toString()}`).emit("dashboard-new-email", dashboardPayload);
          }
        }
      }

      callback();
    } catch (err) {
      console.error("[SMTP] onData error:", err);
      callback(new Error("Failed to process email"));
    }
  },
});

// ---- Bootstrap ----
async function start() {
  console.log("Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 5,
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 10000,
  });
  console.log("MongoDB connected");

  Mailbox =
    mongoose.models.Mailbox || mongoose.model("Mailbox", MailboxSchema);
  IncomingEmail =
    mongoose.models.IncomingEmail ||
    mongoose.model("IncomingEmail", IncomingEmailSchema);

  httpServer.listen(SOCKET_PORT, () => {
    console.log(`[Socket.io] Listening on port ${SOCKET_PORT}`);
  });

  smtpServer.listen(SMTP_PORT, () => {
    console.log(`[SMTP] Server listening on port ${SMTP_PORT}`);
  });

  smtpServer.on("error", (err) => {
    console.error("[SMTP] Server error:", err);
  });

  // ── Auto-delete expired mailboxes (runs every 60s) ──
  setInterval(async () => {
    try {
      const now = new Date();
      const expiredMailboxes = await Mailbox.find({
        expiresAt: { $ne: null, $lte: now },
      }).lean();

      for (const mb of expiredMailboxes) {
        await IncomingEmail.deleteMany({ mailboxId: mb._id });
        await Mailbox.deleteOne({ _id: mb._id });
        console.log(`[Cleanup] Deleted expired mailbox: ${mb.emailAddress}`);
      }

      if (expiredMailboxes.length > 0) {
        console.log(`[Cleanup] Removed ${expiredMailboxes.length} expired mailbox(es)`);
      }
    } catch (err) {
      console.error("[Cleanup] Error:", err.message);
    }
  }, 60 * 1000); // every 60 seconds

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[SMTP] Shutting down gracefully…");
    smtpServer.close(() => console.log("[SMTP] Server closed"));
    httpServer.close(() => console.log("[Socket.io] Server closed"));
    await mongoose.connection.close();
    console.log("[MongoDB] Connection closed");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
