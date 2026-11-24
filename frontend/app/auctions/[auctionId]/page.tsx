"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";

type Lot = {
  _id: string;
  basePrice: number;
  currentBid: number;
  status: string;
  lotNumber: number;
  playerId: { playerId?: string; primaryRole?: string };
};

export default function AuctionDetailPage() {
  const params = useParams<{ auctionId: string }>();
  const auctionId = params.auctionId;
  const [lots, setLots] = useState<Lot[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  const socketUrl = api.replace(/\/api$/, "");

  async function loadLots() {
    const response = await fetch(`${api}/auctions/${auctionId}/players`);
    const payload = await response.json();
    setLots(payload.data ?? []);
  }

  useEffect(() => {
    void loadLots();
    const socket = io(socketUrl);
    socket.emit("auction:join", auctionId);
    socket.on("auction:bid", () => void loadLots());
    socket.on("auction:selection", () => void loadLots());
    return () => { socket.disconnect(); };
  }, [auctionId, api, socketUrl]);

  async function placeBid(lotId: string, amount: number) {
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) {
      setError("Login as a team owner before bidding.");
      return;
    }
    setMessage("");
    setError("");
    const teamId = window.prompt("Enter registered team ObjectId:");
    if (!teamId) return;
    try {
      const response = await fetch(`${api}/auctions/${auctionId}/players/${lotId}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          teamId,
          amount,
          idempotencyKey: `bid-${lotId}-${teamId}-${amount}-${Date.now()}`
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Bid rejected");
      setMessage(`Bid accepted: ₹${payload.data.amount}`);
      await loadLots();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bid rejected");
    }
  }

  return (
    <main className="auctionDetail">
      <header><p>LIVE AUCTION</p><h1>Auction player lots</h1></header>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <section>
        {lots.map((lot) => (
          <article key={lot._id}>
            <div><span>Lot {lot.lotNumber}</span><span>{lot.status}</span></div>
            <h2>{lot.playerId?.playerId ?? "Player"}</h2>
            <p>{lot.playerId?.primaryRole ?? "Role pending"}</p>
            <strong>₹{lot.currentBid}</strong>
            <button
              disabled={lot.status !== "on_block"}
              onClick={() => placeBid(lot._id, lot.currentBid + 100)}
            >
              Bid ₹{lot.currentBid + 100}
            </button>
          </article>
        ))}
      </section>
      <style>{`
        .auctionDetail { max-width:1180px; min-height:100vh; margin:auto; padding:48px 24px; }
        header p { color:#32d583; text-transform:uppercase; letter-spacing:.14em; font-size:12px; }
        section { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        article { display:grid; gap:10px; background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:20px; }
        article div { display:flex; justify-content:space-between; color:#aab8ca; font-size:12px; text-transform:uppercase; }
        article p { color:#aab8ca; } article strong { font-size:28px; }
        button { border:0; border-radius:8px; background:#2684ff; color:#fff; padding:12px; font-weight:800; cursor:pointer; }
        button:disabled { opacity:.55; cursor:not-allowed; } .error { color:#ff8a8a; } .success { color:#32d583; }
        @media(max-width:800px){ section { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}
