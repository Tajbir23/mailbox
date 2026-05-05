import mongoose from "mongoose";

const ApiKeySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    // sha256(rawKey) — raw key is shown once at creation and never stored.
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // First 12 chars of the raw key (e.g. "mb_AbCdEfGh") — safe to display so
    // users can recognise which key is which without revealing the secret.
    keyPrefix: {
      type: String,
      required: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ApiKeySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.ApiKey || mongoose.model("ApiKey", ApiKeySchema);
