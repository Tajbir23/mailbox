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
  },
  { timestamps: true }
);

// Indexes for fast mailbox queries at scale
MailboxSchema.index({ ownerId: 1, createdAt: -1 });
MailboxSchema.index({ sharedWith: 1 });
MailboxSchema.index({ domainId: 1 });

export default mongoose.models.Mailbox || mongoose.model("Mailbox", MailboxSchema);
