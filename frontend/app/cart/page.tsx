"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
type CartLine = { product: { _id: string; name: string; price: number; stock: number }; quantity: number; lineTotal: number };
type Checkout = { orderId: string; providerOrderId: string; keyId?: string; amount: number; currency: string; mode: "mock" | "razorpay" };
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window { Razorpay?: new (options: RazorpayOptions) => { open: () => void } }
}

export default function CartPage() {
  const [items, setItems] = useState<CartLine[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path: string, method = "GET", body?: object) {
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) throw new Error("Log in to view your cart.");
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
    const data = await request("/cart");
    setItems(data.items);
  }

  useEffect(() => {
    refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load cart"));
  }, []);

  async function changeQuantity(productId: string, quantity: number) {
    setError("");
    try {
      if (quantity < 1) await request(`/cart/items/${productId}`, "DELETE");
      else await request(`/cart/items/${productId}`, "PATCH", { quantity });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update cart");
    }
  }

  async function verifyPayment(orderId: string, paymentId: string, signature: string) {
    await request("/payments/verify", "POST", { orderId, paymentId, signature });
    setMessage("Payment verified. Your order is confirmed.");
    await refresh();
  }

  async function loadRazorpay(): Promise<boolean> {
    if (window.Razorpay) return true;
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(Boolean(window.Razorpay));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function checkout() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request("/checkout", "POST") as Checkout;
      if (result.mode === "mock") {
        const paymentId = `mock_payment_${result.orderId}`;
        await verifyPayment(result.providerOrderId, paymentId, `mock_signature_${result.providerOrderId}_${paymentId}`);
        return;
      }
      if (!(await loadRazorpay()) || !result.keyId) throw new Error("Razorpay checkout could not be loaded.");
      const checkoutWindow = new window.Razorpay!({
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        order_id: result.providerOrderId,
        name: "CRICPSR Marketplace",
        description: `Order ${result.orderId}`,
        handler: (payment) => {
          verifyPayment(payment.razorpay_order_id, payment.razorpay_payment_id, payment.razorpay_signature)
            .catch((caught) => setError(caught instanceof Error ? caught.message : "Payment verification failed"));
        },
        modal: { ondismiss: () => setMessage("Checkout closed. Your order remains pending payment; you can pay or cancel it from Orders.") }
      });
      checkoutWindow.open();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start checkout");
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return (
    <main className="cart">
      <nav><Link className="brand" href="/">CRICPSR</Link><div><Link href="/marketplace">Continue shopping</Link><Link href="/orders">Orders</Link></div></nav>
      <h1>Your cart</h1>
      {message && <p className="success">{message}</p>}{error && <p className="error">{error}</p>}
      <section>
        {items.map((item) => (
          <article key={item.product._id}>
            <div><h2>{item.product.name}</h2><p>₹{item.product.price} each · ₹{item.lineTotal}</p></div>
            <div className="controls">
              <button aria-label={`Decrease ${item.product.name} quantity`} onClick={() => changeQuantity(item.product._id, item.quantity - 1)}>−</button>
              <span>{item.quantity}</span>
              <button aria-label={`Increase ${item.product.name} quantity`} disabled={item.quantity >= item.product.stock} onClick={() => changeQuantity(item.product._id, item.quantity + 1)}>+</button>
            </div>
          </article>
        ))}
        {!items.length && <p>Your cart is empty. <Link href="/marketplace">Browse the marketplace.</Link></p>}
      </section>
      {items.length > 0 && <aside><strong>Total: ₹{total}</strong><button disabled={busy} onClick={checkout}>{busy ? "Starting checkout…" : "Checkout"}</button></aside>}
      <style>{`
        .cart { min-height:100vh; max-width:900px; margin:auto; padding:0 24px 64px; }
        nav { height:72px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #17283c; }
        nav div { display:flex; gap:18px; } .brand { font-weight:900; letter-spacing:.12em; }
        h1 { margin-top:42px; } article { display:flex; justify-content:space-between; align-items:center; gap:20px; background:#0d1b2d; border:1px solid #1a3048; border-radius:10px; padding:18px; margin:12px 0; }
        article h2,article p { margin:0 0 6px; } article p { color:#aab8ca; }
        .controls { display:flex; align-items:center; gap:14px; } button { border:0; border-radius:8px; background:#2684ff; color:#fff; padding:10px 14px; font-weight:800; cursor:pointer; }
        button:disabled { opacity:.5; cursor:not-allowed; } aside { display:flex; justify-content:space-between; align-items:center; margin-top:24px; font-size:20px; }
        .error { color:#ff8a8a; } .success { color:#32d583; } a { color:#73aaff; }
      `}</style>
    </main>
  );
}
