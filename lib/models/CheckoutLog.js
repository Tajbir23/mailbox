import mongoose from "mongoose";

const CheckoutLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.CheckoutLog || mongoose.model("CheckoutLog", CheckoutLogSchema);