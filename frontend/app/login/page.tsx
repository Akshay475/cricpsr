"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: form.get("identifier"), password: form.get("password") })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to login");
      localStorage.setItem("cricpsr_access_token", payload.data.accessToken);
      setStatus("success");
      setMessage(`Welcome back, ${payload.data.user.fullName}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to login");
    }
  }

  return (
    <main className="auth">
      <Link className="brand" href="/">CRICPSR</Link>
      <form onSubmit={submit}>
        <p className="eyebrow">Player account</p>
        <h1>Welcome back</h1>
        <label>Email or mobile<input name="identifier" required /></label>
        <label>Password<input name="password" type="password" required /></label>
        <button disabled={status === "loading"}>{status === "loading" ? "Signing in..." : "Login"}</button>
        {message && <p className={status === "error" ? "error" : "success"}>{message}</p>}
        <p>New player? <Link href="/register">Create an account</Link></p>
      </form>
    </main>
  );
}
