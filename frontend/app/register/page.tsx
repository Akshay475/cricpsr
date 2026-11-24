"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          email: form.get("email"),
          mobile: form.get("mobile"),
          password: form.get("password")
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to register");
      localStorage.setItem("cricpsr_access_token", payload.data.accessToken);
      setStatus("success");
      setMessage(`Account created for ${payload.data.user.fullName}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to register");
    }
  }

  return (
    <main className="auth">
      <Link className="brand" href="/">CRICPSR</Link>
      <form onSubmit={submit}>
        <p className="eyebrow">New player</p>
        <h1>Create your account</h1>
        <label>Full name<input name="fullName" required minLength={2} /></label>
        <label>Email<input name="email" type="email" required /></label>
        <label>Mobile number<input name="mobile" inputMode="numeric" pattern="[6-9][0-9]{9}" required /></label>
        <label>Password<input name="password" type="password" minLength={10} required /></label>
        <button disabled={status === "loading"}>{status === "loading" ? "Creating account..." : "Create account"}</button>
        {message && <p className={status === "error" ? "error" : "success"}>{message}</p>}
        <p>Already registered? <Link href="/login">Login</Link></p>
      </form>
    </main>
  );
}
