import mongoose, { type InferSchemaType, type Model } from "mongoose";

const brandSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  website: { type: String, trim: true, maxlength: 300 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  reviewNote: { type: String, trim: true, maxlength: 500 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date
}, { timestamps: true });

brandSchema.index({ ownerId: 1, name: 1 }, { unique: true });

const productSchema = new mongoose.Schema({
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketplaceBrand", required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  category: { type: String, required: true, trim: true, maxlength: 80, index: true },
  price: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  stock: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  imageUrl: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: ["draft", "active", "archived"], default: "draft", index: true },
  sku: { type: String, trim: true, maxlength: 80 }
}, { timestamps: true });

productSchema.index({ sku: 1 }, { unique: true, sparse: true });
productSchema.index({ status: 1, category: 1, createdAt: -1 });

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketplaceProduct", required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }
  }]
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  items: [{
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketplaceBrand", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketplaceProduct", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 1 },
    fulfillmentStatus: { type: String, enum: ["pending", "processing", "shipped", "delivered"], default: "pending" }
  }],
  totalAmount: { type: Number, required: true, min: 1 },
  providerOrderId: { type: String, index: true },
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["pending_payment", "paid", "cancelled", "failed"], default: "pending_payment", index: true }
}, { timestamps: true });

orderSchema.index({ "items.sellerId": 1, createdAt: -1 });

type Brand = InferSchemaType<typeof brandSchema>;
type Product = InferSchemaType<typeof productSchema>;
type Cart = InferSchemaType<typeof cartSchema>;
type Order = InferSchemaType<typeof orderSchema>;

export const MarketplaceBrand: Model<Brand> =
  (mongoose.models.MarketplaceBrand as Model<Brand> | undefined) ?? mongoose.model<Brand>("MarketplaceBrand", brandSchema);
export const MarketplaceProduct: Model<Product> =
  (mongoose.models.MarketplaceProduct as Model<Product> | undefined) ?? mongoose.model<Product>("MarketplaceProduct", productSchema);
export const MarketplaceCart: Model<Cart> =
  (mongoose.models.MarketplaceCart as Model<Cart> | undefined) ?? mongoose.model<Cart>("MarketplaceCart", cartSchema);
export const MarketplaceOrder: Model<Order> =
  (mongoose.models.MarketplaceOrder as Model<Order> | undefined) ?? mongoose.model<Order>("MarketplaceOrder", orderSchema);
