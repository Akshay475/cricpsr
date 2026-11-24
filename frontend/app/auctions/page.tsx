"use client";

import { useEffect, useState } from "react";

type Auction = {
  _id: string;
  name: string;
  level: "district" | "state" | "national";
  status: string;
  startsAt: string;
};

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [level, setLevel] = useState("");
  const [error, setError] = useState("");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

  useEffect(() => {
    const query = level ? `?level=${level}` : "";
    fetch(`${api}/auctions${query}`)
      .then((response) => response.json())
      .then((payload) => setAuctions(payload.data ?? []))
      .catch(() => setError("Unable to load auctions"));
  }, [api, level]);

  return (
    <main className="auctions">
      <header><p>AUCTION ROOM</p><h1>District, state and national auctions</h1></header>
      <div className="filters">
        {["", "district", "state", "national"].map((item) => (
          <button key={item} className={level === item ? "active" : ""} onClick={() => setLevel(item)}>
            {item || "All"}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <section>
        {auctions.length === 0 && <article><h2>No auctions found</h2><p>Authorized administrators can schedule and publish auction events.</p></article>}
        {auctions.map((auction) => (
          <article key={auction._id}>
            <div><span>{auction.level}</span><span>{auction.status}</span></div>
            <h2>{auction.name}</h2>
            <p>{new Date(auction.startsAt).toLocaleString()}</p>
          </article>
        ))}
      </section>
      <style>{`
        .auctions { max-width:1180px; min-height:100vh; margin:auto; padding:48px 24px; }
        header p { color:#32d583; text-transform:uppercase; letter-spacing:.14em; font-size:12px; }
        .filters { display:flex; gap:8px; margin:24px 0; }
        .filters button { border:1px solid #314559; background:#0d1b2d; color:#fff; border-radius:8px; padding:10px 14px; cursor:pointer; text-transform:capitalize; }
        .filters button.active { background:#2684ff; border-color:#2684ff; }
        section { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        article { background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:20px; }
        article div { display:flex; justify-content:space-between; color:#aab8ca; font-size:12px; text-transform:uppercase; }
        article p { color:#aab8ca; } .error { color:#ff8a8a; }
        @media(max-width:800px){ section { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}
