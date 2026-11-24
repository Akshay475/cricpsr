"use client";

import { FormEvent, useEffect, useState } from "react";

const profileStyles = `
  .auth select,.auth textarea { width:100%; border:1px solid #314559; border-radius:8px; background:#07111f; color:#fff; padding:12px; }
  .auth textarea { min-height:96px; resize:vertical; }
  .auth .check { grid-template-columns:auto 1fr; align-items:center; }
  .auth .check input { width:auto; }
`;

type Location = { _id: string; name: string };

export default function ProfilePage() {
  const [states, setStates] = useState<Location[]>([]);
  const [districts, setDistricts] = useState<Location[]>([]);
  const [zones, setZones] = useState<Location[]>([]);
  const [stateId, setStateId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

  useEffect(() => {
    fetch(`${api}/locations/states`).then((response) => response.json()).then((payload) => setStates(payload.data ?? []));
  }, [api]);

  async function loadDistricts(nextStateId: string) {
    setStateId(nextStateId);
    setDistrictId("");
    setZones([]);
    const response = await fetch(`${api}/locations/states/${nextStateId}/districts`);
    const payload = await response.json();
    setDistricts(payload.data ?? []);
  }

  async function loadZones(nextDistrictId: string) {
    setDistrictId(nextDistrictId);
    const response = await fetch(`${api}/locations/districts/${nextDistrictId}/zones`);
    const payload = await response.json();
    setZones(payload.data ?? []);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) {
      setStatus("error");
      setMessage("Login before saving a player profile.");
      return;
    }
    setStatus("loading");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${api}/players/me/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dateOfBirth: form.get("dateOfBirth"),
          stateId,
          districtId,
          zoneId: form.get("zoneId"),
          localArea: form.get("localArea"),
          primaryRole: form.get("primaryRole"),
          battingStyle: form.get("battingStyle"),
          bowlingStyle: form.get("bowlingStyle"),
          cricketExperience: form.get("cricketExperience"),
          publicProfile: form.get("publicProfile") === "on"
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to save profile");
      setStatus("success");
      setMessage("Player profile saved.");
    } catch (caught) {
      setStatus("error");
      setMessage(caught instanceof Error ? caught.message : "Unable to save profile");
    }
  }

  return (
    <main className="auth">
      <form onSubmit={submit}>
        <p className="eyebrow">Player profile</p>
        <h1>Cricket profile and location</h1>
        <label>Date of birth<input name="dateOfBirth" type="date" required /></label>
        <label>State<select value={stateId} onChange={(event) => loadDistricts(event.target.value)} required><option value="">Select state</option>{states.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
        <label>District<select value={districtId} onChange={(event) => loadZones(event.target.value)} required><option value="">Select district</option>{districts.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
        <label>Zone<select name="zoneId" required><option value="">Select zone</option>{zones.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
        <label>Local area<input name="localArea" maxLength={100} /></label>
        <label>Primary role<select name="primaryRole" required><option>Batter</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option><option>Wicketkeeper-Batter</option></select></label>
        <label>Batting style<select name="battingStyle" required><option>Right-handed</option><option>Left-handed</option></select></label>
        <label>Bowling style<select name="bowlingStyle" required><option>Right-arm fast</option><option>Left-arm fast</option><option>Right-arm medium</option><option>Left-arm medium</option><option>Right-arm spin</option><option>Left-arm spin</option><option>Does not bowl</option></select></label>
        <label>Cricket experience<textarea name="cricketExperience" maxLength={2000} /></label>
        <label className="check"><input name="publicProfile" type="checkbox" defaultChecked /> Public profile visible</label>
        <button disabled={status === "loading"}>{status === "loading" ? "Saving..." : "Save profile"}</button>
        {message && <p className={status === "error" ? "error" : "success"}>{message}</p>}
      </form>
      <style>{profileStyles}</style>
    </main>
  );
}
