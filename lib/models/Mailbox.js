import mongoose from "mongoose";

const MailboxSchema = new mongoose.Schema(
  {
    emailAddress: {
      type: String,
      required: [true, "Email address is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    domainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Domain",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sharedWith: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    // Owner-set mailbox tags (e.g. "Work", "VIP"). Distinct from per-email tags.
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// Indexes for fast mailbox queries at scale
MailboxSchema.index({ ownerId: 1, createdAt: -1 });
MailboxSchema.index({ sharedWith: 1 });
MailboxSchema.index({ domainId: 1 });
MailboxSchema.index({ expiresAt: 1 }, { sparse: true });
MailboxSchema.index({ ownerId: 1, tags: 1 });

export default mongoose.models.Mailbox || mongoose.model("Mailbox", MailboxSchema);
