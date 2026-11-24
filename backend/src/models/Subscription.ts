import mongoose from "mongoose";

export const subscriptionPlans = [
  { id: "monthly", name: "Monthly", price: 250, validityDays: 30 },
  { id: "six_months", name: "Six Months", price: 1199, validityDays: 180 },
  { id: "annual", name: "Annual", price: 2099, validityDays: 365 }
] as const;

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  planId: { type: String, enum: subscriptionPlans.map((plan) => plan.id), required: true },
  status: { type: String, enum: ["pending", "active", "expired", "cancelled"], default: "pending", index: true },
  startsAt: Date,
  expiresAt: Date,
  providerOrderId: { type: String, index: true },
  providerPaymentId: { type: String, unique: true, sparse: true }
}, { timestamps: true });

export const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
