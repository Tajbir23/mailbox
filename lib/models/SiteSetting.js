import mongoose from "mongoose";

const SiteSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "Key is required"],
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// `key` already has a unique index via the field definition (unique: true).

export default mongoose.models.SiteSetting ||
  mongoose.model("SiteSetting", SiteSettingSchema);
