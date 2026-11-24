"use client";

import { useEffect, useState } from "react";

type Ranking = { rank: number; playerId: string; rating: number; verifiedMatches: number };

export default function RankingsPage() {
  const [category, setCategory] = useState<"batting" | "bowling" | "fielding">("batting");
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

  useEffect(() => {
    fetch(`${api}/rankings/${category}`)
      .then((response) => response.json())
      .then((payload) => setRankings(payload.data ?? []));
  }, [api, category]);

  return (
    <main className="rankings">
      <h1>Independent player rankings</h1>
      <div className="tabs">
        {(["batting", "bowling", "fielding"] as const).map((item) => (
          <button key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}>{item}</button>
        ))}
      </div>
      <table>
        <thead><tr><th>Rank</th><th>Player</th><th>{category} rating</th><th>Verified matches</th></tr></thead>
        <tbody>{rankings.map((item) => <tr key={item.playerId}><td>{item.rank}</td><td>{item.playerId}</td><td>{item.rating}/1000</td><td>{item.verifiedMatches}</td></tr>)}</tbody>
      </table>
      <style>{`
        .rankings { max-width:1180px; min-height:100vh; margin:auto; padding:48px 24px; }
        .tabs { display:flex; gap:8px; margin:24px 0; } button { border:1px solid #314559; background:#0d1b2d; color:#fff; border-radius:8px; padding:10px 14px; text-transform:capitalize; cursor:pointer; }
        button.active { background:#2684ff; border-color:#2684ff; }
        table { width:100%; border-collapse:collapse; background:#0d1b2d; } th,td { text-align:left; border-bottom:1px solid #1a3048; padding:16px; } th { color:#aab8ca; }
      `}</style>
    </main>
  );
}
