import mongoose from "mongoose";

const OIDCTokenSchema = new mongoose.Schema(
  {
    token_hash: {
      type: String,
      required: [true, "Token hash is required"],
    },
    token_type: {
      type: String,
      enum: ["access_token", "refresh_token"],
      required: [true, "Token type is required"],
    },
    client_id: {
      type: String,
      required: [true, "Client ID is required"],
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    scopes: {
      type: [String],
      default: [],
    },
    revoked: {
      type: Boolean,
      default: false,
    },
    parent_refresh_token: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required"],
    },
  },
  { timestamps: true }
);

// Index on token_hash for fast token lookups
OIDCTokenSchema.index({ token_hash: 1 });

// Compound index on client_id + user_id for finding all tokens for a client-user pair
OIDCTokenSchema.index({ client_id: 1, user_id: 1 });

// Index on parent_refresh_token for cascade revocation lookups
OIDCTokenSchema.index({ parent_refresh_token: 1 });

// TTL index: automatically remove tokens once they expire to prevent unbounded
// growth. Expired tokens are already rejected by the endpoints, and reuse
// detection only matters within a token's validity window, so cleanup is safe.
OIDCTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.OIDCToken ||
  mongoose.model("OIDCToken", OIDCTokenSchema);
