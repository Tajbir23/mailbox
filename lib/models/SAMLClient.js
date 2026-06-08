import mongoose from "mongoose";

const SAMLClientSchema = new mongoose.Schema(
  {
    sp_entity_id: {
      type: String,
      required: [true, "SP Entity ID is required"],
      unique: true,
      trim: true,
    },
    display_name: {
      type: String,
      required: [true, "Display name is required"],
      trim: true,
    },
    acs_urls: {
      type: [String],
      default: [],
    },
    default_acs_url: {
      type: String,
      default: null,
    },
    nameid_format: {
      type: String,
      default: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    },
    attribute_mapping: {
      type: Map,
      of: String,
      default: undefined,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// `sp_entity_id` already has a unique index via the field definition (unique: true).

export default mongoose.models.SAMLClient ||
  mongoose.model("SAMLClient", SAMLClientSchema);
