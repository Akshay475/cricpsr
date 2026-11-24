import crypto from "node:crypto";
import Razorpay from "razorpay";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { Payment } from "../models/Payment.js";
import { Subscription, subscriptionPlans } from "../models/Subscription.js";
import { isMockPaymentsAllowed } from "../payments/policy.js";

export const subscriptionRouter = Router();

subscriptionRouter.get("/plans", (_req, res) => {
  res.json({ data: subscriptionPlans });
});

subscriptionRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const subscription = await Subscription.findOne({ userId: req.auth?.userId }).sort({ createdAt: -1 });
  res.json({ data: subscription });
});

const checkoutSchema = z.object({ planId: z.enum(subscriptionPlans.map((plan) => plan.id) as [string, ...string[]]) });

subscriptionRouter.post("/checkout", requireAuth, async (req: AuthRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const plan = subscriptionPlans.find((item) => item.id === parsed.data.planId);
  if (!plan) return res.status(400).json({ error: { code: "INVALID_PLAN", message: "Unknown subscription plan" } });
  if (!isMockPaymentsAllowed(env.NODE_ENV) && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) {
    return res.status(503).json({ error: { code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "Razorpay is not configured" } });
  }

  const subscription = await Subscription.create({ userId: req.auth?.userId, planId: plan.id, status: "pending" });
  let providerOrderId: string;
  let provider: "razorpay" | "mock" = "mock";
  let keyId: string | undefined;

  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({
      amount: plan.price * 100,
      currency: "INR",
      receipt: String(subscription._id),
      notes: { planId: plan.id, userId: String(req.auth?.userId) }
    });
    providerOrderId = String(order.id);
    provider = "razorpay";
    keyId = env.RAZORPAY_KEY_ID;
  } else {
    providerOrderId = `mock_order_${crypto.randomBytes(8).toString("hex")}`;
  }

  await Subscription.findByIdAndUpdate(subscription._id, { providerOrderId });
  await Payment.create({
    userId: req.auth?.userId,
    subscriptionId: subscription._id,
    provider,
    providerOrderId,
    amount: plan.price,
    currency: "INR",
    status: "created"
  });

  res.status(201).json({
    data: {
      mode: provider,
      orderId: providerOrderId,
      amount: plan.price * 100,
      currency: "INR",
      keyId,
      plan
    }
  });
});

const verificationSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1)
});

subscriptionRouter.post("/verify", requireAuth, async (req: AuthRequest, res) => {
  const parsed = verificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });

  const payment = await Payment.findOne({ providerOrderId: parsed.data.orderId, userId: req.auth?.userId });
  if (!payment) return res.status(404).json({ error: { code: "PAYMENT_NOT_FOUND", message: "Payment order not found" } });
  if (payment.provider === "mock" && !isMockPaymentsAllowed(env.NODE_ENV)) {
    return res.status(503).json({ error: { code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "Mock payment verification is disabled" } });
  }

  let verified = false;
  if (payment.provider === "mock") {
    verified = parsed.data.signature === `mock_signature_${parsed.data.orderId}_${parsed.data.paymentId}`;
  } else if (env.RAZORPAY_KEY_SECRET) {
    const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${parsed.data.orderId}|${parsed.data.paymentId}`)
      .digest("hex");
    verified = parsed.data.signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parsed.data.signature));
  }

  if (!verified) return res.status(400).json({ error: { code: "PAYMENT_VERIFICATION_FAILED", message: "Payment signature did not verify" } });

  const subscription = await Subscription.findById(payment.subscriptionId);
  if (!subscription) return res.status(404).json({ error: { code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found" } });
  const plan = subscriptionPlans.find((item) => item.id === subscription.planId);
  if (!plan) return res.status(500).json({ error: { code: "INVALID_PLAN", message: "Stored subscription plan is invalid" } });

  const startsAt = new Date();
  const expiresAt = new Date(startsAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + plan.validityDays);

  await Payment.findByIdAndUpdate(payment._id, {
    providerPaymentId: parsed.data.paymentId,
    status: "verified",
    verifiedAt: startsAt
  });
  await Subscription.findByIdAndUpdate(subscription._id, {
    status: "active",
    startsAt,
    expiresAt,
    providerPaymentId: parsed.data.paymentId
  });

  res.json({ data: { status: "active", startsAt, expiresAt, plan } });
});
