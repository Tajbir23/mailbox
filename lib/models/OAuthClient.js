import mongoose from "mongoose";

const OAuthClientSchema = new mongoose.Schema(
  {
    client_id: {
      type: String,
      required: [true, "Client ID is required"],
      unique: true,
      trim: true,
    },
    client_secret_hash: {
      type: String,
      default: null,
      select: false,
    },
    client_type: {
      type: String,
      enum: ["public", "confidential"],
      default: "confidential",
    },
    display_name: {
      type: String,
      required: [true, "Display name is required"],
      trim: true,
    },
    redirect_uris: {
      type: [String],
      default: [],
    },
    allowed_scopes: {
      type: [String],
      default: ["openid", "profile", "email"],
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// `client_id` already has a unique index via the field definition (unique: true).

export default mongoose.models.OAuthClient ||
  mongoose.model("OAuthClient", OAuthClientSchema);
