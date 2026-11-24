"use client";

import { useEffect, useState } from "react";

type OpenMatch = {
  _id: string;
  name: string;
  format: string;
  scheduledAt: string;
  playerLimit: number;
  joiningFee: number;
  status: string;
  registrations: unknown[];
};

export default function FindMatchPage() {
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

  async function loadMatches() {
    const response = await fetch(`${api}/open-matches`);
    const payload = await response.json();
    setMatches(payload.data ?? []);
  }

  useEffect(() => {
    void loadMatches();
  }, [api]);

  async function register(matchId: string) {
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) {
      setError("Login before joining an open match.");
      return;
    }
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${api}/open-matches/${matchId}/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to join match");
      setMessage("Registration confirmed.");
      await loadMatches();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to join match");
    }
  }

  return (
    <main className="findMatch">
      <header><p>FIND YOUR MATCH</p><h1>Open cricket matches</h1></header>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <section>
        {matches.length === 0 && <article><h2>No open matches nearby</h2><p>Turf owners can publish available matches.</p></article>}
        {matches.map((match) => (
          <article key={match._id}>
            <div><span>{match.format}</span><span>{match.status}</span></div>
            <h2>{match.name}</h2>
            <p>{new Date(match.scheduledAt).toLocaleString()}</p>
            <small>{match.registrations.length}/{match.playerLimit} players · ₹{match.joiningFee}</small>
            <button disabled={match.status !== "open"} onClick={() => register(match._id)}>
              {match.status === "open" ? "Join match" : "Registration closed"}
            </button>
          </article>
        ))}
      </section>
      <style>{`
        .findMatch { max-width:1180px; min-height:100vh; margin:auto; padding:48px 24px; }
        header p { color:#32d583; text-transform:uppercase; letter-spacing:.14em; font-size:12px; }
        section { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:24px; }
        article { display:grid; gap:12px; background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:20px; }
        article div { display:flex; justify-content:space-between; color:#aab8ca; font-size:12px; text-transform:uppercase; }
        article p,article small { color:#aab8ca; }
        button { border:0; border-radius:8px; background:#2684ff; color:#fff; padding:12px; font-weight:800; cursor:pointer; }
        button:disabled { opacity:.55; cursor:not-allowed; }
        .error { color:#ff8a8a; } .success { color:#32d583; }
        @media(max-width:800px){ section { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}
