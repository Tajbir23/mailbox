import mongoose from "mongoose";
import crypto from "crypto";

const DomainSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Domain name is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // ---- DNS verification ----
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "failed"],
      default: "pending",
    },
    verificationToken: {
      type: String,
      default: () => crypto.randomBytes(16).toString("hex"),
    },
    // Flag for domains added via admin panel (not shown in user's My Domains)
    isSystemDomain: {
      type: Boolean,
      default: false,
    },
    // Track which DNS records have been confirmed
    dnsRecords: {
      mxVerified: { type: Boolean, default: false },
      txtVerified: { type: Boolean, default: false },
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for scalable domain queries
DomainSchema.index({ ownerId: 1, createdAt: -1 });
DomainSchema.index({ isActive: 1, verificationStatus: 1, visibility: 1 });
DomainSchema.index({ visibility: 1, isActive: 1 });

export default mongoose.models.Domain || mongoose.model("Domain", DomainSchema);
