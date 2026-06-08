import mongoose from "mongoose";

const UserConsentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  client_id: {
    type: String,
    required: true,
  },
  granted_scopes: {
    type: [String],
    default: [],
  },
  granted_at: {
    type: Date,
    default: Date.now,
  },
});

// Unique compound index: one consent record per user per client
UserConsentSchema.index({ user_id: 1, client_id: 1 }, { unique: true });

export default mongoose.models.UserConsent ||
  mongoose.model("UserConsent", UserConsentSchema);
