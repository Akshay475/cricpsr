"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
type Order = {
  _id: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: Array<{ productName: string; quantity: number; lineTotal: number; fulfillmentStatus: string }>;
};
type PaymentCheckout = { orderId: string; providerOrderId: string; keyId?: string; amount: number; currency: string; mode: "mock" | "razorpay" };
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

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadOrders() {
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) throw new Error("Log in to view your orders.");
    const response = await fetch(`${api}/marketplace/orders`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Unable to load orders");
    setOrders(payload.data);
  }

  useEffect(() => {
    loadOrders().catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load orders"));
  }, []);

  async function cancelOrder(orderId: string) {
    const token = localStorage.getItem("cricpsr_access_token");
    setError(""); setMessage("");
    try {
      const response = await fetch(`${api}/marketplace/orders/${orderId}/cancel`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? payload.error?.code ?? "Unable to cancel order");
      setMessage("Pending order cancelled and inventory released.");
      await loadOrders();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to cancel order"); }
  }

  async function payOrder(orderId: string) {
    const token = localStorage.getItem("cricpsr_access_token");
    setError(""); setMessage("");
    try {
      const response = await fetch(`${api}/marketplace/orders/${orderId}/payment`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? payload.error?.code ?? "Unable to start payment");
      const payment = payload.data as PaymentCheckout;
      if (payment.mode === "mock") {
        const paymentId = `mock_payment_${payment.orderId}`;
        const verify = await fetch(`${api}/marketplace/payments/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            orderId: payment.providerOrderId,
            paymentId,
            signature: `mock_signature_${payment.providerOrderId}_${paymentId}`
          })
        });
        const result = await verify.json();
        if (!verify.ok) throw new Error(result.error?.message ?? "Payment verification failed");
        setMessage("Test payment verified. Your order is confirmed.");
        await loadOrders();
        return;
      }
      if (!payment.keyId) throw new Error("Razorpay is not configured for this order.");
      if (!window.Razorpay) {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        const loaded = new Promise<boolean>((resolve) => {
          script.onload = () => resolve(Boolean(window.Razorpay));
          script.onerror = () => resolve(false);
        });
        document.head.appendChild(script);
        if (!(await loaded)) throw new Error("Razorpay checkout could not be loaded.");
      }
      new window.Razorpay!({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        order_id: payment.providerOrderId,
        name: "CRICPSR Marketplace",
        description: `Order ${payment.orderId}`,
        handler: async (result) => {
          const verify = await fetch(`${api}/marketplace/payments/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              orderId: result.razorpay_order_id,
              paymentId: result.razorpay_payment_id,
              signature: result.razorpay_signature
            })
          });
          const payload = await verify.json();
          if (!verify.ok) {
            setError(payload.error?.message ?? payload.error?.code ?? "Payment verification failed");
            return;
          }
          setMessage("Payment verified. Your order is confirmed.");
          await loadOrders();
        },
        modal: { ondismiss: () => setMessage("Checkout closed. Your order is still pending payment.") }
      }).open();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to start payment"); }
  }

  return (
    <main className="orders">
      <nav><Link className="brand" href="/">CRICPSR</Link><div><Link href="/marketplace">Marketplace</Link><Link href="/cart">Cart</Link><Link href="/seller">Sell</Link></div></nav>
      <h1>Your orders</h1>
      {message && <p className="success">{message}</p>}{error && <p className="error">{error}</p>}
      {orders.map((order) => (
        <article key={order._id}>
          <header><div><strong>Order {order._id.slice(-8)}</strong><small>{new Date(order.createdAt).toLocaleDateString()}</small></div><b>{order.status.replace("_", " ")}</b></header>
          {order.items.map((item, index) => <p key={`${order._id}-${index}`}>{item.productName} × {item.quantity} · ₹{item.lineTotal} · {item.fulfillmentStatus}</p>)}
          <footer><strong>Total: ₹{order.totalAmount}</strong>{order.status === "pending_payment" && <div>
            <button onClick={() => payOrder(order._id)}>Pay now</button>
            <button onClick={() => cancelOrder(order._id)}>Cancel pending order</button>
          </div>}</footer>
        </article>
      ))}
      {!orders.length && !error && <p>No orders yet. <Link href="/marketplace">Browse the marketplace.</Link></p>}
      <style>{`
        .orders { min-height:100vh; max-width:900px; margin:auto; padding:0 24px 64px; }
        nav { height:72px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #17283c; }
        nav div { display:flex; gap:18px; } .brand { font-weight:900; letter-spacing:.12em; }
        h1 { margin-top:42px; } article { background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:20px; margin:14px 0; }
        article header,footer { display:flex; justify-content:space-between; align-items:center; gap:16px; }
        article header div { display:grid; gap:4px; } small,p { color:#aab8ca; }         footer { border-top:1px solid #1a3048; padding-top:14px; margin-top:14px; } footer div { display:flex; gap:8px; }
        button { border:0; border-radius:8px; background:#a52a35; color:#fff; padding:10px 14px; font-weight:800; cursor:pointer; }
        a { color:#73aaff; } .success { color:#32d583; } .error { color:#ff8a8a; }
      `}</style>
    </main>
  );
}
