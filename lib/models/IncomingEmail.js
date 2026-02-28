import mongoose from "mongoose";

const IncomingEmailSchema = new mongoose.Schema(
  {
    mailboxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mailbox",
      required: true,
      index: true,
    },
    from: {
      type: String,
      required: true,
    },
    to: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      default: "(No Subject)",
    },
    bodyHtml: {
      type: String,
      default: "",
    },
    bodyText: {
      type: String,
      default: "",
    },
    attachments: [
      {
        filename: String,
        contentType: String,
        size: Number,
        content: Buffer,
      },
    ],
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes for fast email retrieval and pagination at scale
IncomingEmailSchema.index({ mailboxId: 1, receivedAt: -1 });
IncomingEmailSchema.index({ mailboxId: 1, createdAt: -1 });
IncomingEmailSchema.index({ mailboxId: 1, isRead: 1 });

export default mongoose.models.IncomingEmail || mongoose.model("IncomingEmail", IncomingEmailSchema);
