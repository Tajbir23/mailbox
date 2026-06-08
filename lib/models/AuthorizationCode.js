import mongoose from "mongoose";

const AuthorizationCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
    },
    client_id: {
      type: String,
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    redirect_uri: {
      type: String,
      required: true,
    },
    scopes: {
      type: [String],
      required: true,
    },
    state: {
      type: String,
    },
    nonce: {
      type: String,
    },
    code_challenge: {
      type: String,
    },
    code_challenge_method: {
      type: String,
    },
    used: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Index for fast code lookups
AuthorizationCodeSchema.index({ code: 1 });

// TTL index for automatic expiry - documents are removed after expiresAt time
AuthorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AuthorizationCode ||
  mongoose.model("AuthorizationCode", AuthorizationCodeSchema);
