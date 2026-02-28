import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mailbox-saas";

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable in .env.local");
}

/**
 * Global cache to reuse the same connection across hot reloads in dev
 * and across serverless function invocations in production.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  // If we already have a healthy connection, return it immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // If the previous connection attempt failed or disconnected, reset
  if (cached.promise && mongoose.connection.readyState === 0) {
    cached.promise = null;
    cached.conn = null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: true,                // Allow buffering while connecting
      maxPoolSize: 20,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      serverSelectionTimeoutMS: 30000,     // Wait up to 30s to find a server
      heartbeatFrequencyMS: 10000,
      autoIndex: process.env.NODE_ENV !== "production",
      retryWrites: true,
      retryReads: true,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongooseInstance) => {
        console.log("[MongoDB] Connected successfully");
        return mongooseInstance;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    // Reset on failure so the next call retries the connection
    cached.promise = null;
    cached.conn = null;
    console.error("[MongoDB] Connection failed:", e.message);
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
