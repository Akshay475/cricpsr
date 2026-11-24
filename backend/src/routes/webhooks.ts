import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { Payment } from "../models/Payment.js";
import { MarketplaceOrder, MarketplaceProduct } from "../models/Marketplace.js";
import { Subscription, subscriptionPlans } from "../models/Subscription.js";

export const webhookRouter = Router();

webhookRouter.post("/razorpay", async (req, res) => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ error: { code: "WEBHOOK_NOT_CONFIGURED" } });
  const signature = String(req.header("x-razorpay-signature") ?? "");
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return res.status(400).json({ error: { code: "INVALID_WEBHOOK_SIGNATURE" } });
  }

  const event = JSON.parse(rawBody.toString()) as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  const paymentEntity = event.payload?.payment?.entity;
  if (!["payment.captured", "payment.failed"].includes(event.event ?? "") || !paymentEntity?.order_id || !paymentEntity.id) {
    return res.status(200).json({ received: true });
  }

  const payment = await Payment.findOne({ providerOrderId: paymentEntity.order_id });
  if (!payment) return res.status(404).json({ error: { code: "PAYMENT_NOT_FOUND" } });
  if (payment.orderId) {
    const order = await MarketplaceOrder.findById(payment.orderId);
    if (!order) return res.status(404).json({ error: { code: "ORDER_NOT_FOUND" } });
    if (event.event === "payment.failed") {
      if (payment.status !== "verified") {
        const session = await MarketplaceOrder.startSession();
        try {
          await session.withTransaction(async () => {
            const pendingOrder = await MarketplaceOrder.findOne({ _id: order._id, status: "pending_payment" }).session(session);
            if (pendingOrder) {
              pendingOrder.status = "failed";
              await pendingOrder.save({ session });
              for (const item of pendingOrder.items) {
                await MarketplaceProduct.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }, { session });
              }
            }
            payment.status = "failed";
            await payment.save({ session });
          });
        } finally {
          await session.endSession();
        }
      }
      return res.status(200).json({ received: true });
    }
    if (order.status === "pending_payment") {
      payment.providerPaymentId = paymentEntity.id;
      payment.status = "verified";
      payment.verifiedAt = new Date();
      order.status = "paid";
      await Promise.all([payment.save(), order.save()]);
    }
    return res.status(200).json({ received: true });
  }
  if (event.event === "payment.failed") {
    payment.status = "failed";
    await payment.save();
    return res.status(200).json({ received: true });
  }
  if (!payment.subscriptionId) return res.status(404).json({ error: { code: "PAYMENT_TARGET_NOT_FOUND" } });
  const subscription = await Subscription.findById(payment.subscriptionId);
  if (!subscription) return res.status(404).json({ error: { code: "SUBSCRIPTION_NOT_FOUND" } });
  const plan = subscriptionPlans.find((item) => item.id === subscription.planId);
  if (!plan) return res.status(500).json({ error: { code: "INVALID_PLAN" } });

  const startsAt = new Date();
  const expiresAt = new Date(startsAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + plan.validityDays);
  await Payment.findByIdAndUpdate(payment._id, { providerPaymentId: paymentEntity.id, status: "verified", verifiedAt: startsAt });
  await Subscription.findByIdAndUpdate(subscription._id, { status: "active", startsAt, expiresAt, providerPaymentId: paymentEntity.id });
  res.status(200).json({ received: true });
});
