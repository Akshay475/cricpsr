"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { loginAndNavigate } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await loginAndNavigate(String(form.get("identifier") ?? ""), String(form.get("password") ?? ""), {
        apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
        storage: window.localStorage,
        navigate: (path) => router.replace(path)
      });
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
        {message && <p className="error" role="alert">{message}</p>}
        <p>New player? <Link href="/register">Create an account</Link></p>
      </form>
    </main>
  );
}
