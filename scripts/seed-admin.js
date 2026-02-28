/**
 * Seed script – creates the first admin user.
 * Usage:  npm run seed
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
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

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, lowercase: true, trim: true },
    password: String,
    role: { type: String, enum: ["admin", "user"], default: "user" },
  },
  { timestamps: true }
);

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const User = mongoose.models.User || mongoose.model("User", UserSchema);

  const existing = await User.findOne({ role: "admin" });
  if (existing) {
    console.log("Admin already exists: " + existing.email);
    process.exit(0);
  }

  const hashed = await bcrypt.hash("admin123", 12);
  const admin = await User.create({
    name: "Admin",
    email: "admin@mailbox.local",
    password: hashed,
    role: "admin",
  });

  console.log("Admin created -> " + admin.email + " / password: admin123");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
