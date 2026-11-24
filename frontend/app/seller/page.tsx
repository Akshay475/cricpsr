"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
type Brand = { _id: string; name: string; status: string };
type Product = { _id: string; brandId: string; name: string; price: number; stock: number; status: string };
type Order = {
  id: string;
  status: string;
  items: Array<{ productName: string; quantity: number; lineTotal: number; fulfillmentStatus: string }>;
};
type Dashboard = { productCount: number; activeProductCount: number; lowStockCount: number; orderCount: number; unitsSold: number; grossSales: number };

export default function SellerPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(path: string, method = "GET", body?: object) {
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) throw new Error("Log in to access seller tools.");
    const response = await fetch(`${api}/marketplace${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? payload.error?.code ?? "Marketplace request failed");
    return payload.data;
  }

  async function refresh() {
    const [sellerData, productData, orderData, dashboardData] = await Promise.all([
      request("/seller/brands"), request("/seller/products"), request("/seller/orders"), request("/seller/dashboard")
    ]);
    setBrands(sellerData); setProducts(productData); setOrders(orderData); setDashboard(dashboardData);
  }

  useEffect(() => {
    refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load seller dashboard"));
  }, []);

  async function registerBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage(""); setError("");
    try {
      await request("/brands", "POST", {
        name: form.get("brandName"), description: form.get("brandDescription"), website: form.get("website") || undefined
      });
      formElement.reset();
      setMessage("Brand submitted for review. Products can be listed after approval.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Brand registration failed"); }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage(""); setError("");
    try {
      await request("/products", "POST", {
        brandId: form.get("brandId"), name: form.get("productName"), description: form.get("description"),
        category: form.get("category"), price: Number(form.get("price")), stock: Number(form.get("stock")),
        imageUrl: form.get("imageUrl") || undefined
      });
      formElement.reset();
      setMessage("Product listed.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to list product"); }
  }

  async function updateFulfillment(orderId: string, status: string) {
    setError(""); setMessage("");
    try {
      await request(`/seller/orders/${orderId}/fulfillment`, "PATCH", { status });
      setMessage(`Order fulfillment updated to ${status}.`);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update order"); }
  }

  async function updateProduct(product: Product, changes: { stock?: number; status?: string }) {
    setError(""); setMessage("");
    try {
      await request(`/products/${product._id}`, "PATCH", changes);
      setMessage(`${product.name} inventory updated.`);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update inventory"); }
  }

  const approvedBrands = brands.filter((brand) => brand.status === "approved");
  return (
    <main className="seller">
      <nav><Link className="brand" href="/">CRICPSR</Link><div><Link href="/marketplace">Marketplace</Link><Link href="/orders">Buyer orders</Link></div></nav>
      <header><p className="eyebrow">SELLER CENTRE</p><h1>Manage your cricket store</h1></header>
      {message && <p className="success">{message}</p>}{error && <p className="error">{error}</p>}
      {dashboard && <section className="stats">
        <article><strong>{dashboard.activeProductCount}/{dashboard.productCount}</strong><span>Active products</span></article>
        <article><strong>{dashboard.orderCount}</strong><span>Paid orders</span></article>
        <article><strong>{dashboard.unitsSold}</strong><span>Units sold</span></article>
        <article><strong>₹{dashboard.grossSales}</strong><span>Gross sales</span></article>
      </section>}
      <section className="columns">
        <article>
          <h2>Register a brand</h2><p>New brands are reviewed before their products become visible.</p>
          <form onSubmit={registerBrand}>
            <label>Brand name<input name="brandName" required minLength={2} maxLength={120} /></label>
            <label>Description<textarea name="brandDescription" required minLength={10} maxLength={2000} /></label>
            <label>Website (optional)<input name="website" type="url" /></label>
            <button type="submit">Submit brand</button>
          </form>
          <h3>Your brands</h3>{brands.map((brand) => <p key={brand._id}>{brand.name} <small>{brand.status}</small></p>)}
        </article>
        <article>
          <h2>List a product</h2>
          {!approvedBrands.length && <p>Register a brand and wait for approval before listing products.</p>}
          {approvedBrands.length > 0 && <form onSubmit={createProduct}>
            <label>Brand<select name="brandId" required>{approvedBrands.map((brand) => <option key={brand._id} value={brand._id}>{brand.name}</option>)}</select></label>
            <label>Product name<input name="productName" required minLength={2} maxLength={160} /></label>
            <label>Description<textarea name="description" required minLength={10} maxLength={3000} /></label>
            <label>Category<input name="category" required maxLength={80} /></label>
            <label>Price (₹)<input name="price" type="number" min="1" step="1" required /></label>
            <label>Stock<input name="stock" type="number" min="0" step="1" required /></label>
            <label>Image URL (optional)<input name="imageUrl" type="url" /></label>
            <button type="submit">Publish product</button>
          </form>}
        </article>
      </section>
      <section className="columns">
        <article><h2>Inventory</h2>{products.map((product) => <div className="inventory" key={product._id}>
          <p>{product.name} · ₹{product.price} · {product.stock} in stock · {product.status}</p>
          <button onClick={() => updateProduct(product, { stock: product.stock + 10 })}>Restock +10</button>
          <button onClick={() => updateProduct(product, { status: product.status === "archived" ? "active" : "archived" })}>
            {product.status === "archived" ? "Republish" : "Archive"}
          </button>
        </div>)}{!products.length && <p>No products yet.</p>}</article>
        <article><h2>Paid orders</h2>{orders.map((order) => {
          const current = order.items[0]?.fulfillmentStatus;
          const next = current === "pending" ? "processing" : current === "processing" ? "shipped" : current === "shipped" ? "delivered" : null;
          return <div className="order" key={order.id}>
            <strong>Order {order.id.slice(-8)}</strong><p>{order.items.map((item) => `${item.productName} × ${item.quantity} · ${item.fulfillmentStatus}`).join(", ")}</p>
            {next && <button onClick={() => updateFulfillment(order.id, next)}>Mark {next}</button>}
          </div>;
        })}{!orders.length && <p>Paid orders will appear here.</p>}</article>
      </section>
      <style>{`
        .seller { min-height:100vh; max-width:1180px; margin:auto; padding:0 24px 64px; }
        nav { height:72px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #17283c; }
        nav div { display:flex; gap:18px; } .brand { font-weight:900; letter-spacing:.12em; }
        header { padding:38px 0 16px; } .eyebrow { color:#32d583; font-size:12px; letter-spacing:.14em; }
        .stats,.columns { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin:18px 0; }
        .columns { grid-template-columns:repeat(2,1fr); }
        article { background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:18px; }
        .stats article { display:grid; gap:8px; } .stats strong { font-size:24px; } .stats span,small,p { color:#aab8ca; }
        form { display:grid; gap:12px; } label { display:grid; gap:6px; color:#aab8ca; }
        input,textarea,select { width:100%; border:1px solid #314559; border-radius:8px; background:#07111f; color:#fff; padding:10px; }
        textarea { min-height:76px; resize:vertical; } button { border:0; border-radius:8px; background:#2684ff; color:#fff; padding:10px 14px; font-weight:800; cursor:pointer; }
        .order { border-top:1px solid #1a3048; padding:12px 0; } .success { color:#32d583; } .error { color:#ff8a8a; }
        .inventory { border-top:1px solid #1a3048; padding:12px 0; } .inventory button { margin:0 8px 8px 0; }
        @media(max-width:800px){ .stats { grid-template-columns:repeat(2,1fr); } .columns { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}
