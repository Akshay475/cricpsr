"use client";

import { useEffect, useState } from "react";

type Tournament = {
  _id: string;
  name: string;
  format: string;
  venueName: string;
  startDate: string;
  status: string;
  ageCategory: string;
};

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [error, setError] = useState("");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

  useEffect(() => {
    fetch(`${api}/tournaments`)
      .then((response) => response.json())
      .then((payload) => setTournaments(payload.data ?? []))
      .catch(() => setError("Unable to load tournaments"));
  }, [api]);

  return (
    <main className="phaseThree">
      <header><p>Cricket management</p><h1>Tournaments</h1></header>
      {error && <p className="error">{error}</p>}
      <section>
        {tournaments.length === 0 && <article><h2>No tournaments scheduled</h2><p>Tournament organizers can create and publish competitions here.</p></article>}
        {tournaments.map((tournament) => (
          <article key={tournament._id}>
            <div><span>{tournament.format}</span><span>{tournament.status}</span></div>
            <h2>{tournament.name}</h2>
            <p>{tournament.venueName}</p>
            <small>{tournament.ageCategory} · {new Date(tournament.startDate).toLocaleDateString()}</small>
          </article>
        ))}
      </section>
      <style>{`
        .phaseThree { max-width:1180px; min-height:100vh; margin:auto; padding:48px 24px; }
        header p { color:#32d583; text-transform:uppercase; letter-spacing:.14em; font-size:12px; }
        section { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        article { background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:20px; }
        article div { display:flex; justify-content:space-between; color:#aab8ca; font-size:12px; text-transform:uppercase; }
        article p,article small { color:#aab8ca; } .error { color:#ff8a8a; }
        @media(max-width:800px){ section { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}
