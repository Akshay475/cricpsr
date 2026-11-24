import crypto from "node:crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { MarketplaceBrand, MarketplaceCart, MarketplaceOrder, MarketplaceProduct } from "../models/Marketplace.js";
import { Payment } from "../models/Payment.js";
import { User } from "../models/User.js";
import { isMockPaymentsAllowed } from "../payments/policy.js";

export const marketplaceRouter = Router();

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const brandSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(2000),
  website: z.string().url().max(300).optional().or(z.literal(""))
});
const productSchema = z.object({
  brandId: objectIdSchema,
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(3000),
  category: z.string().trim().min(2).max(80),
  price: z.number().int().positive().max(10000000),
  stock: z.number().int().nonnegative().max(1000000),
  imageUrl: z.string().url().max(1000).optional().or(z.literal("")),
  sku: z.string().trim().min(1).max(80).optional()
});
const productUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().min(10).max(3000).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  price: z.number().int().positive().max(10000000).optional(),
  stock: z.number().int().nonnegative().max(1000000).optional(),
  imageUrl: z.string().url().max(1000).optional().or(z.literal("")),
  status: z.enum(["draft", "active", "archived"]).optional()
}).refine((value) => Object.keys(value).length > 0);
const quantitySchema = z.object({ productId: objectIdSchema, quantity: z.number().int().positive().max(1000) });
const reviewSchema = z.object({ status: z.enum(["approved", "rejected"]), reviewNote: z.string().trim().max(500).optional() });
const paymentVerifySchema = z.object({
  orderId: z.string().min(1).max(100),
  paymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(256)
});
const fulfillmentSchema = z.object({ status: z.enum(["processing", "shipped", "delivered"]) });

function validationError(res: import("express").Response, error: z.ZodError) {
  return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: error.flatten() } });
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function mockSignature(orderId: string, paymentId: string): string {
  return `mock_signature_${orderId}_${paymentId}`;
}

marketplaceRouter.get("/brands", async (_req, res) => {
  const brands = await MarketplaceBrand.find({ status: "approved" }).select("name description website").sort({ name: 1 }).lean();
  res.json({ data: brands });
});

marketplaceRouter.post("/brands", requireAuth, async (req: AuthRequest, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const brand = await MarketplaceBrand.create({ ...parsed.data, ownerId: req.auth?.userId, status: "pending" });
  await User.findByIdAndUpdate(req.auth?.userId, { $addToSet: { roles: "seller" } });
  res.status(201).json({ data: brand });
});

marketplaceRouter.get("/brands/:brandId/products", async (req, res) => {
  const brandId = objectIdSchema.safeParse(req.params.brandId);
  if (!brandId.success) return res.status(400).json({ error: { code: "INVALID_BRAND_ID" } });
  const brand = await MarketplaceBrand.exists({ _id: brandId.data, status: "approved" });
  if (!brand) return res.status(404).json({ error: { code: "BRAND_NOT_FOUND" } });
  const products = await MarketplaceProduct.find({ brandId: brandId.data, status: "active", stock: { $gt: 0 } })
    .select("name description category price stock imageUrl brandId")
    .sort({ createdAt: -1 }).lean();
  res.json({ data: products });
});

marketplaceRouter.get("/products", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 80) : "";
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  const approvedBrandIds = await MarketplaceBrand.distinct("_id", { status: "approved" });
  const filter: Record<string, unknown> = { status: "active", stock: { $gt: 0 }, brandId: { $in: approvedBrandIds } };
  if (category) filter.category = category;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { description: { $regex: escaped, $options: "i" } },
      { category: { $regex: escaped, $options: "i" } }
    ];
  }
  const products = await MarketplaceProduct.find(filter)
    .select("name description category price stock imageUrl brandId")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit).limit(limit).lean();
  const total = await MarketplaceProduct.countDocuments(filter);
  res.json({ data: products, pagination: { page, limit, total } });
});

marketplaceRouter.get("/products/:productId", async (req, res) => {
  const productId = objectIdSchema.safeParse(req.params.productId);
  if (!productId.success) return res.status(400).json({ error: { code: "INVALID_PRODUCT_ID" } });
  const product = await MarketplaceProduct.findOne({ _id: productId.data, status: "active", stock: { $gt: 0 } })
    .select("name description category price stock imageUrl brandId").lean();
  if (!product) return res.status(404).json({ error: { code: "PRODUCT_NOT_FOUND" } });
  if (!(await MarketplaceBrand.exists({ _id: product.brandId, status: "approved" }))) {
    return res.status(404).json({ error: { code: "PRODUCT_NOT_FOUND" } });
  }
  res.json({ data: product });
});

marketplaceRouter.post("/products", requireAuth, async (req: AuthRequest, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const brand = await MarketplaceBrand.findOne({
    _id: parsed.data.brandId,
    ownerId: req.auth?.userId,
    status: "approved"
  });
  if (!brand) return res.status(403).json({ error: { code: "BRAND_NOT_APPROVED", message: "An approved brand you own is required" } });
  const product = await MarketplaceProduct.create({
    ...parsed.data,
    brandId: brand._id,
    ownerId: req.auth?.userId,
    status: parsed.data.stock > 0 ? "active" : "draft"
  });
  res.status(201).json({ data: product });
});

marketplaceRouter.patch("/products/:productId", requireAuth, async (req: AuthRequest, res) => {
  const productId = objectIdSchema.safeParse(req.params.productId);
  if (!productId.success) return res.status(400).json({ error: { code: "INVALID_PRODUCT_ID" } });
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const product = await MarketplaceProduct.findOne({ _id: productId.data, ownerId: req.auth?.userId });
  if (!product) return res.status(404).json({ error: { code: "PRODUCT_NOT_FOUND" } });
  if (parsed.data.status === "active" || (parsed.data.stock !== undefined && parsed.data.stock > 0)) {
    const brand = await MarketplaceBrand.findOne({ _id: product.brandId, ownerId: req.auth?.userId, status: "approved" });
    if (!brand) return res.status(409).json({ error: { code: "BRAND_NOT_APPROVED" } });
  }
  product.set(parsed.data);
  await product.save();
  res.json({ data: product });
});

marketplaceRouter.get("/seller/dashboard", requireAuth, async (req: AuthRequest, res) => {
  const ownerId = new mongoose.Types.ObjectId(req.auth?.userId);
  const [brands, products, orders] = await Promise.all([
    MarketplaceBrand.find({ ownerId }).select("name status").sort({ createdAt: -1 }).lean(),
    MarketplaceProduct.find({ ownerId }).select("status stock").lean(),
    MarketplaceOrder.find({ "items.sellerId": ownerId, status: "paid" }).select("items totalAmount status").lean()
  ]);
  const soldItems = orders.flatMap((order) => order.items.filter((item) => String(item.sellerId) === String(ownerId)));
  res.json({
    data: {
      brands,
      productCount: products.length,
      activeProductCount: products.filter((product) => product.status === "active").length,
      lowStockCount: products.filter((product) => product.stock < 5).length,
      orderCount: orders.length,
      unitsSold: soldItems.reduce((sum, item) => sum + item.quantity, 0),
      grossSales: soldItems.reduce((sum, item) => sum + item.lineTotal, 0)
    }
  });
});

marketplaceRouter.get("/seller/products", requireAuth, async (req: AuthRequest, res) => {
  const products = await MarketplaceProduct.find({ ownerId: req.auth?.userId }).sort({ updatedAt: -1 }).lean();
  res.json({ data: products });
});

marketplaceRouter.get("/seller/orders", requireAuth, async (req: AuthRequest, res) => {
  const orders = await MarketplaceOrder.find({ "items.sellerId": req.auth?.userId }).sort({ createdAt: -1 }).lean();
  res.json({
    data: orders.map((order) => ({
      id: order._id,
      status: order.status,
      createdAt: order.createdAt,
      items: order.items.filter((item) => String(item.sellerId) === req.auth?.userId)
    }))
  });
});

marketplaceRouter.patch("/seller/orders/:orderId/fulfillment", requireAuth, async (req: AuthRequest, res) => {
  const orderId = objectIdSchema.safeParse(req.params.orderId);
  if (!orderId.success) return res.status(400).json({ error: { code: "INVALID_ORDER_ID" } });
  const parsed = fulfillmentSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const order = await MarketplaceOrder.findOne({
    _id: orderId.data,
    "items.sellerId": req.auth?.userId,
    status: "paid"
  });
  if (!order) return res.status(404).json({ error: { code: "ORDER_NOT_FOUND" } });
  const sellerItems = order.items.filter((item) => String(item.sellerId) === req.auth?.userId);
  const nextStatus = parsed.data.status;
  const transitions: Record<string, string> = { pending: "processing", processing: "shipped", shipped: "delivered" };
  if (sellerItems.some((item) => transitions[item.fulfillmentStatus] !== nextStatus)) {
    return res.status(409).json({ error: { code: "INVALID_FULFILLMENT_TRANSITION" } });
  }
  sellerItems.forEach((item) => { item.fulfillmentStatus = nextStatus; });
  await order.save();
  res.json({ data: { id: order._id, status: order.status, items: sellerItems } });
});

marketplaceRouter.get("/cart", requireAuth, async (req: AuthRequest, res) => {
  const cart = await MarketplaceCart.findOne({ userId: req.auth?.userId }).lean();
  if (!cart) return res.json({ data: { items: [] } });
  const productIds = cart.items.map((item) => item.productId);
  const products = await MarketplaceProduct.find({ _id: { $in: productIds } })
    .select("name price stock imageUrl status").lean();
  const byId = new Map(products.map((product) => [String(product._id), product]));
  res.json({
    data: {
      items: cart.items.flatMap((item) => {
        const product = byId.get(String(item.productId));
        return product ? [{ product, quantity: item.quantity, lineTotal: product.price * item.quantity }] : [];
      })
    }
  });
});

marketplaceRouter.post("/cart/items", requireAuth, async (req: AuthRequest, res) => {
  const parsed = quantitySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const product = await MarketplaceProduct.findOne({ _id: parsed.data.productId, status: "active" });
  if (!product || !(await MarketplaceBrand.exists({ _id: product.brandId, status: "approved" }))) {
    return res.status(409).json({ error: { code: "PRODUCT_UNAVAILABLE" } });
  }
  const current = await MarketplaceCart.findOne({ userId: req.auth?.userId });
  const existing = current?.items.find((item) => String(item.productId) === parsed.data.productId);
  if (product.stock < parsed.data.quantity + (existing?.quantity ?? 0)) {
    return res.status(409).json({ error: { code: "PRODUCT_UNAVAILABLE" } });
  }
  if (existing && current) {
    existing.quantity += parsed.data.quantity;
    await current.save();
  } else if (current) {
    current.items.push({ productId: product._id, quantity: parsed.data.quantity });
    await current.save();
  } else {
    await MarketplaceCart.create({ userId: req.auth?.userId, items: [parsed.data] });
  }
  res.status(200).json({ data: { added: true } });
});

marketplaceRouter.patch("/cart/items/:productId", requireAuth, async (req: AuthRequest, res) => {
  const productId = objectIdSchema.safeParse(req.params.productId);
  const parsed = z.object({ quantity: z.number().int().positive().max(1000) }).safeParse(req.body);
  if (!productId.success) return res.status(400).json({ error: { code: "INVALID_PRODUCT_ID" } });
  if (!parsed.success) return validationError(res, parsed.error);
  const product = await MarketplaceProduct.findOne({ _id: productId.data, status: "active", stock: { $gte: parsed.data.quantity } });
  if (!product) return res.status(409).json({ error: { code: "PRODUCT_UNAVAILABLE" } });
  const cart = await MarketplaceCart.findOneAndUpdate(
    { userId: req.auth?.userId, "items.productId": productId.data },
    { $set: { "items.$.quantity": parsed.data.quantity } },
    { new: true }
  );
  if (!cart) return res.status(404).json({ error: { code: "CART_ITEM_NOT_FOUND" } });
  res.json({ data: { updated: true } });
});

marketplaceRouter.delete("/cart/items/:productId", requireAuth, async (req: AuthRequest, res) => {
  const productId = objectIdSchema.safeParse(req.params.productId);
  if (!productId.success) return res.status(400).json({ error: { code: "INVALID_PRODUCT_ID" } });
  await MarketplaceCart.updateOne({ userId: req.auth?.userId }, { $pull: { items: { productId: productId.data } } });
  res.json({ data: { removed: true } });
});

class CheckoutConflict extends Error {}

marketplaceRouter.post("/checkout", requireAuth, async (req: AuthRequest, res) => {
  if (!isMockPaymentsAllowed(env.NODE_ENV) && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) {
    return res.status(503).json({ error: { code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "Razorpay is not configured" } });
  }
  const cart = await MarketplaceCart.findOne({ userId: req.auth?.userId }).lean();
  if (!cart?.items.length) return res.status(400).json({ error: { code: "EMPTY_CART" } });
  const products = await MarketplaceProduct.find({ _id: { $in: cart.items.map((item) => item.productId) } }).lean();
  const approvedBrandIds = new Set((await MarketplaceBrand.distinct("_id", { status: "approved" })).map(String));
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const lines = cart.items.map((item) => {
    const product = productById.get(String(item.productId));
    if (!product || product.status !== "active" || product.stock < item.quantity || !approvedBrandIds.has(String(product.brandId))) return null;
    return {
      brandId: product.brandId,
      productId: product._id,
      sellerId: product.ownerId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      lineTotal: product.price * item.quantity
    };
  });
  if (lines.some((line) => !line)) return res.status(409).json({ error: { code: "CART_STOCK_CHANGED" } });
  const items = lines.filter((line): line is NonNullable<typeof line> => line !== null);
  const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const orderId = new mongoose.Types.ObjectId();
  const useRazorpay = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  let providerOrderId = `mock_order_${crypto.randomBytes(8).toString("hex")}`;
  if (useRazorpay) {
    const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
    const providerOrder = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: "INR",
      receipt: String(orderId),
      notes: { orderId: String(orderId), userId: String(req.auth?.userId) }
    });
    providerOrderId = String(providerOrder.id);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const availableBrands = await MarketplaceBrand.find({
        _id: { $in: items.map((item) => item.brandId) }, status: "approved"
      }).distinct("_id").session(session);
      if (new Set(availableBrands.map(String)).size !== new Set(items.map((item) => String(item.brandId))).size) {
        throw new CheckoutConflict("A brand in your cart is no longer available");
      }
      for (const item of items) {
        const result = await MarketplaceProduct.updateOne(
          { _id: item.productId, status: "active", stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session }
        );
        if (result.modifiedCount !== 1) throw new CheckoutConflict("Inventory changed during checkout");
      }
      await MarketplaceOrder.create([{
        _id: orderId,
        userId: req.auth?.userId,
        items,
        totalAmount,
        providerOrderId,
        status: "pending_payment"
      }], { session });
      await Payment.create([{
        userId: req.auth?.userId,
        orderId,
        provider: useRazorpay ? "razorpay" : "mock",
        providerOrderId,
        amount: totalAmount,
        currency: "INR",
        status: "created"
      }], { session });
      await MarketplaceCart.updateOne({ userId: req.auth?.userId }, { $set: { items: [] } }, { session });
    });
  } catch (error) {
    if (error instanceof CheckoutConflict) return res.status(409).json({ error: { code: "CART_STOCK_CHANGED", message: error.message } });
    throw error;
  } finally {
    await session.endSession();
  }
  res.status(201).json({
    data: {
      orderId,
      orderStatus: "pending_payment",
      amount: totalAmount * 100,
      currency: "INR",
      mode: useRazorpay ? "razorpay" : "mock",
      providerOrderId,
      keyId: useRazorpay ? env.RAZORPAY_KEY_ID : undefined
    }
  });
});

marketplaceRouter.post("/payments/verify", requireAuth, async (req: AuthRequest, res) => {
  const parsed = paymentVerifySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const payment = await Payment.findOne({
    providerOrderId: parsed.data.orderId,
    orderId: { $exists: true, $ne: null },
    userId: req.auth?.userId
  });
  if (!payment) return res.status(404).json({ error: { code: "PAYMENT_NOT_FOUND" } });
  if (payment.provider === "mock" && !isMockPaymentsAllowed(env.NODE_ENV)) {
    return res.status(503).json({ error: { code: "PAYMENT_PROVIDER_UNAVAILABLE" } });
  }
  if (payment.status === "verified" && payment.providerPaymentId === parsed.data.paymentId) {
    return res.json({ data: { status: "paid", orderId: payment.orderId } });
  }
  let verified = false;
  if (payment.provider === "mock") {
    verified = safeEqual(parsed.data.signature, mockSignature(parsed.data.orderId, parsed.data.paymentId));
  } else if (env.RAZORPAY_KEY_SECRET) {
    const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${parsed.data.orderId}|${parsed.data.paymentId}`).digest("hex");
    verified = safeEqual(expected, parsed.data.signature);
  }
  if (!verified) return res.status(400).json({ error: { code: "PAYMENT_VERIFICATION_FAILED" } });
  const order = await MarketplaceOrder.findOne({ _id: payment.orderId, userId: req.auth?.userId });
  if (!order) return res.status(404).json({ error: { code: "ORDER_NOT_FOUND" } });
  if (order.status !== "pending_payment" && order.status !== "paid") {
    return res.status(409).json({ error: { code: "ORDER_NOT_PAYABLE" } });
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      payment.providerPaymentId = parsed.data.paymentId;
      payment.status = "verified";
      payment.verifiedAt = new Date();
      order.status = "paid";
      await payment.save({ session });
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  res.json({ data: { status: "paid", orderId: order._id } });
});

marketplaceRouter.get("/orders", requireAuth, async (req: AuthRequest, res) => {
  const orders = await MarketplaceOrder.find({ userId: req.auth?.userId }).sort({ createdAt: -1 }).lean();
  res.json({ data: orders });
});

marketplaceRouter.get("/orders/:orderId/payment", requireAuth, async (req: AuthRequest, res) => {
  const orderId = objectIdSchema.safeParse(req.params.orderId);
  if (!orderId.success) return res.status(400).json({ error: { code: "INVALID_ORDER_ID" } });
  const order = await MarketplaceOrder.findOne({ _id: orderId.data, userId: req.auth?.userId, status: "pending_payment" });
  if (!order) return res.status(404).json({ error: { code: "PAYABLE_ORDER_NOT_FOUND" } });
  const payment = await Payment.findOne({ orderId: order._id, userId: req.auth?.userId, status: "created" });
  if (!payment) return res.status(404).json({ error: { code: "PAYMENT_NOT_FOUND" } });
  res.json({
    data: {
      orderId: order._id,
      providerOrderId: payment.providerOrderId,
      amount: payment.amount * 100,
      currency: payment.currency,
      mode: payment.provider,
      keyId: payment.provider === "razorpay" ? env.RAZORPAY_KEY_ID : undefined
    }
  });
});

marketplaceRouter.post("/orders/:orderId/cancel", requireAuth, async (req: AuthRequest, res) => {
  const orderId = objectIdSchema.safeParse(req.params.orderId);
  if (!orderId.success) return res.status(400).json({ error: { code: "INVALID_ORDER_ID" } });
  const session = await mongoose.startSession();
  let cancelled = false;
  try {
    await session.withTransaction(async () => {
      const order = await MarketplaceOrder.findOne({
        _id: orderId.data,
        userId: req.auth?.userId,
        status: "pending_payment"
      }).session(session);
      if (!order) return;
      order.status = "cancelled";
      await order.save({ session });
      for (const item of order.items) {
        await MarketplaceProduct.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }, { session });
      }
      cancelled = true;
    });
  } finally {
    await session.endSession();
  }
  if (!cancelled) return res.status(409).json({ error: { code: "ORDER_NOT_CANCELLABLE" } });
  res.json({ data: { status: "cancelled" } });
});

marketplaceRouter.get("/seller/brands", requireAuth, async (req: AuthRequest, res) => {
  const brands = await MarketplaceBrand.find({ ownerId: req.auth?.userId }).sort({ createdAt: -1 }).lean();
  res.json({ data: brands });
});

marketplaceRouter.patch("/brands/:brandId/review", requireAuth, requireRole("superAdmin"), async (req: AuthRequest, res) => {
  const brandId = objectIdSchema.safeParse(req.params.brandId);
  const parsed = reviewSchema.safeParse(req.body);
  if (!brandId.success) return res.status(400).json({ error: { code: "INVALID_BRAND_ID" } });
  if (!parsed.success) return validationError(res, parsed.error);
  const brand = await MarketplaceBrand.findByIdAndUpdate(brandId.data, {
    ...parsed.data,
    reviewedBy: req.auth?.userId,
    reviewedAt: new Date()
  }, { new: true, runValidators: true });
  if (!brand) return res.status(404).json({ error: { code: "BRAND_NOT_FOUND" } });
  res.json({ data: brand });
});
