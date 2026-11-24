"use client";

import { useEffect, useState } from "react";

type Plan = { id: string; name: string; price: number; validityDays: number };

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

  useEffect(() => {
    fetch(`${api}/subscriptions/plans`).then((response) => response.json()).then((payload) => setPlans(payload.data ?? []));
  }, [api]);

  async function checkout(planId: string) {
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) {
      setStatus("error");
      setMessage("Login before purchasing a subscription.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(`${api}/subscriptions/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to create checkout");
      setStatus("success");
      setMessage(payload.data.mode === "mock"
        ? `Test checkout created: ${payload.data.orderId}. Live Razorpay keys are not configured.`
        : `Razorpay test order created: ${payload.data.orderId}.`);
    } catch (caught) {
      setStatus("error");
      setMessage(caught instanceof Error ? caught.message : "Unable to create checkout");
    }
  }

  return (
    <main className="pricing">
      <h1>Subscription plans</h1>
      <p>Platform access is separate from tournament, match, marketplace, and other fees.</p>
      <section>
        {plans.map((plan) => (
          <article key={plan.id}>
            <h2>{plan.name}</h2>
            <strong>₹{plan.price}</strong>
            <span>{plan.validityDays} days</span>
            <button onClick={() => checkout(plan.id)}>Choose plan</button>
          </article>
        ))}
      </section>
      {message && <p className={status === "error" ? "error" : "success"}>{message}</p>}
      <style>{`
        .pricing { min-height:100vh; max-width:1180px; margin:auto; padding:64px 24px; }
        .pricing>p { color:#aab8ca; } section { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:32px; }
        article { display:grid; gap:12px; background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:24px; }
        article strong { font-size:36px; } article span { color:#aab8ca; } button { border:0; border-radius:8px; background:#2684ff; color:#fff; padding:12px; font-weight:800; cursor:pointer; }
        .error { color:#ff8a8a; } .success { color:#32d583; }
        @media(max-width:800px){ section { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}
