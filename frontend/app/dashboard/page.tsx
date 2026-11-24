"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const dashboardStyles = `
  .dashboard { min-height:100vh; padding-bottom:64px; }
  .dashboard nav { height:72px; max-width:1180px; margin:auto; padding:0 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #17283c; }
  .dashboard nav div { display:flex; gap:18px; } .brand { font-weight:900; letter-spacing:.12em; }
  .dashboard header,.ratingGrid,.quickGrid { max-width:1180px; margin:auto; padding-left:24px; padding-right:24px; }
  .dashboard header { padding-top:48px; } .eyebrow { color:#32d583; text-transform:uppercase; letter-spacing:.14em; font-size:12px; }
  .dashboard h1 { margin:10px 0; } .error { color:#ff8a8a; }
  .ratingGrid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:24px; }
  .ratingGrid article,.quickGrid article { background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:20px; }
  .ratingHead { display:flex; justify-content:space-between; align-items:end; } .ratingHead span { color:#aab8ca; font-weight:800; }
  .ratingHead b { font-size:28px; } .bar { height:8px; background:#17283c; border-radius:99px; margin:18px 0 12px; overflow:hidden; }
  .bar i { display:block; height:100%; background:#2684ff; } .ratingGrid small,.ratingGrid p { color:#aab8ca; }
  .quickGrid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-top:16px; } .quickGrid p { color:#aab8ca; }
  .quickGrid a { color:#73aaff; font-weight:800; }
  .ratingGrid article.primary { border-color:#2684ff; box-shadow:0 12px 32px #2684ff18; }
  @media(max-width:800px){ .ratingGrid,.quickGrid { grid-template-columns:1fr; } .dashboard nav div { gap:10px; } }
`;

type Profile = {
  playerId?: string;
  primaryRole?: string;
  stateId?: { name?: string };
  districtId?: { name?: string };
  zoneId?: { name?: string };
  ratings?: {
    batting: { rating: number; dataStatus: string; verifiedMatches: number };
    bowling: { rating: number; dataStatus: string; verifiedMatches: number };
    fielding: { rating: number; dataStatus: string; verifiedMatches: number };
  };
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [profileMissing, setProfileMissing] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) {
      setError("Login to view your player dashboard.");
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/players/me/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          if (response.status === 404 && payload.error?.code === "PROFILE_NOT_FOUND") {
            setProfileMissing(true);
            return;
          }
          throw new Error(payload.error?.message ?? "Unable to load profile");
        }
        setProfile(payload.data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load profile"));
  }, []);

  const ratings = profile?.ratings ?? {
    batting: { rating: 400, dataStatus: "insufficient", verifiedMatches: 0 },
    bowling: { rating: 400, dataStatus: "insufficient", verifiedMatches: 0 },
    fielding: { rating: 400, dataStatus: "insufficient", verifiedMatches: 0 }
  };

  const emphasizedCategory =
    profile?.primaryRole === "Bowler" ? "Bowling" :
    profile?.primaryRole === "Batter" ? "Batting" :
    profile?.primaryRole === "Wicketkeeper" || profile?.primaryRole === "Wicketkeeper-Batter" ? "Fielding" :
    "All";

  const suggestions = [
    emphasizedCategory === "Batting" ? "Improve innings depth and strike conversion." :
    emphasizedCategory === "Bowling" ? "Improve economy and wicket-taking consistency." :
    emphasizedCategory === "Fielding" ? "Improve catching and direct-hit opportunities." :
    "Track separate batting, bowling, and fielding performance."
  ];

  return (
    <main className="dashboard">
      <nav><Link className="brand" href="/">CRICPSR</Link><div><Link href="/profile">Profile</Link><Link href="/subscriptions">Subscription</Link></div></nav>
      <header>
        <p className="eyebrow">Player dashboard</p>
        <h1>{profile?.primaryRole ? `${profile.primaryRole} dashboard` : "Your cricket profile"}</h1>
        {profile && <p>{profile.playerId} · {profile.stateId?.name} · {profile.districtId?.name} · {profile.zoneId?.name}</p>}
        {profileMissing && <p>Complete your player profile to personalize your dashboard. <Link href="/profile">Complete profile</Link></p>}
        {error && <p className="error">{error} <Link href="/login">Login</Link></p>}
      </header>

      <section className="ratingGrid" aria-label="Independent player ratings">
        {([
          ["Batting", ratings.batting],
          ["Bowling", ratings.bowling],
          ["Fielding", ratings.fielding]
        ] as const).map(([name, rating]) => (
          <article key={name} className={emphasizedCategory === name || emphasizedCategory === "All" ? "primary" : ""}>
            <div className="ratingHead"><span>{name}</span><b>{rating.rating}/1000</b></div>
            <div className="bar"><i style={{ width: `${((rating.rating - 400) / 600) * 100}%` }} /></div>
            <p>{rating.dataStatus === "insufficient" ? "Insufficient Performance Data" : "Verified Performance"}</p>
            <small>{rating.verifiedMatches} verified matches</small>
          </article>
        ))}
      </section>

      <section className="quickGrid">
        <article><h2>Improvement suggestions</h2><p>{suggestions[0]}</p></article>
        <article><h2>All ratings remain independent</h2><p>No batting, bowling, or fielding score is averaged into an overall player rating.</p></article>
      </section>

      <section className="quickGrid">
        <article><h2>Profile</h2><p>Update location, role, batting style, bowling style, experience, and public visibility.</p><Link href="/profile">Manage profile</Link></article>
        <article><h2>Subscription</h2><p>Choose monthly, six-month, or annual platform access.</p><Link href="/subscriptions">View plans</Link></article>
      </section>

      <style>{dashboardStyles}</style>
    </main>
  );
}
