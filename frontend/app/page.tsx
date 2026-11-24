import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <nav className="nav">
        <Link className="brand" href="/">CRICPSR</Link>
        <div className="actions">
          <Link href="/marketplace">Marketplace</Link>
          <Link href="/login">Login</Link>
          <Link className="outline" href="/register">Join the platform</Link>
        </div>
      </nav>

      <section className="hero">
        <div>
          <p className="eyebrow">The cricket performance ecosystem</p>
          <h1>Turn verified cricket performance into opportunity.</h1>
          <p className="copy">Discover tournaments and matches, build verified performance history, and receive independent batting, bowling, and fielding ratings.</p>
          <div className="heroActions">
            <Link className="primary" href="/register">Create player profile</Link>
            <Link className="secondary" href="/login">Login</Link>
          </div>
        </div>

        <aside className="ratings" aria-label="Independent player rating preview">
          <p>PLAYER PROFILE</p>
          <div><span>BATTING</span><strong>850</strong><small>/1000</small></div>
          <div><span>BOWLING</span><strong>400</strong><small>/1000</small></div>
          <div><span>FIELDING</span><strong>720</strong><small>/1000</small></div>
        </aside>
      </section>

      <style>{`
        main { min-height:100vh; }
        .nav { height:72px; max-width:1180px; margin:auto; padding:0 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #17283c; }
        .brand { font-weight:900; letter-spacing:.12em; }
        .actions { display:flex; align-items:center; gap:20px; }
        .outline { border:1px solid #2684ff; border-radius:8px; padding:10px 16px; }
        .hero { max-width:1180px; min-height:560px; margin:auto; padding:64px 24px; display:grid; grid-template-columns:1.15fr .85fr; align-items:center; gap:64px; }
        .eyebrow { color:#32d583; text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:800; }
        h1 { max-width:720px; margin:18px 0 24px; font-size:clamp(44px,7vw,76px); line-height:.98; letter-spacing:-.045em; }
        .copy { max-width:620px; color:#aab8ca; font-size:18px; line-height:1.7; }
        .heroActions { display:flex; gap:12px; margin-top:32px; }
        .primary,.secondary { border-radius:8px; padding:14px 18px; font-weight:800; }
        .primary { background:#2684ff; } .secondary { border:1px solid #314559; }
        .ratings { background:#0d1b2d; border:1px solid #1a3048; border-radius:16px; padding:20px; }
        .ratings>p { color:#aab8ca; font-size:12px; letter-spacing:.08em; }
        .ratings div { display:grid; grid-template-columns:1fr auto auto; align-items:end; gap:6px; border-top:1px solid #1a3048; padding:18px 4px; }
        .ratings span { color:#aab8ca; font-size:12px; font-weight:800; }
        .ratings strong { font-size:34px; } .ratings small { color:#aab8ca; }
        @media(max-width:800px) { .hero { grid-template-columns:1fr; gap:24px; } h1 { font-size:48px; } .actions>a:first-child { display:none; } }
      `}</style>
    </main>
  );
}
