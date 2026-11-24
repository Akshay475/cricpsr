import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketplaceOrder", index: true },
  provider: { type: String, enum: ["razorpay", "mock"], default: "mock" },
  providerOrderId: { type: String, required: true, index: true },
  providerPaymentId: { type: String, sparse: true, unique: true },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["created", "verified", "failed", "refunded"], default: "created" },
  verifiedAt: Date,
  webhookEventId: { type: String, unique: true, sparse: true }
}, { timestamps: true });

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
