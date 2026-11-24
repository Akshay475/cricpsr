import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { OpenMatch, TurfProfile } from "../models/Competitive.js";
import { PlayerProfile } from "../models/PlayerProfile.js";

export const openMatchRouter = Router();

const openMatchSchema = z.object({
  turfId: z.string().min(1),
  name: z.string().trim().min(2),
  scheduledAt: z.coerce.date(),
  format: z.enum(["1-over", "3-over", "5-over", "T20", "Custom"]),
  playerLimit: z.number().int().min(2).max(22),
  joiningFee: z.number().min(0).default(0),
  teamMode: z.enum(["random", "fixed"]).default("random")
}).refine((value) => value.scheduledAt > new Date(), { message: "Match time must be in the future", path: ["scheduledAt"] });

openMatchRouter.get("/", async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.zoneId) filter.zoneId = req.query.zoneId;
  if (req.query.status) filter.status = req.query.status;
  const matches = await OpenMatch.find(filter).sort({ scheduledAt: 1 });
  res.json({ data: matches });
});

openMatchRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = openMatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const turf = await TurfProfile.findById(parsed.data.turfId);
  if (!turf) return res.status(404).json({ error: { code: "TURF_NOT_FOUND", message: "Turf not found" } });
  const match = await OpenMatch.create({
    ...parsed.data,
    creatorId: req.auth?.userId,
    zoneId: turf.zoneId
  });
  res.status(201).json({ data: match });
});

openMatchRouter.post("/:matchId/register", requireAuth, async (req: AuthRequest, res) => {
  const match = await OpenMatch.findById(req.params.matchId);
  if (!match) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Open match not found" } });
  if (match.status !== "open") return res.status(409).json({ error: { code: "REGISTRATION_CLOSED", message: "Match is not open for registration" } });
  if (match.registrations.length >= match.playerLimit) return res.status(409).json({ error: { code: "MATCH_FULL", message: "No registration slots remain" } });
  if (match.registrations.some((registration: { userId: unknown }) => String(registration.userId) === req.auth?.userId)) {
    return res.status(409).json({ error: { code: "ALREADY_REGISTERED", message: "Player is already registered" } });
  }
  const profile = await PlayerProfile.findOne({ userId: req.auth?.userId });
  if (!profile) return res.status(400).json({ error: { code: "PROFILE_REQUIRED", message: "Create a player profile before joining" } });
  if (String(profile.zoneId) !== String(match.zoneId)) return res.status(400).json({ error: { code: "ZONE_MISMATCH", message: "Match is outside the player zone" } });

  match.registrations.push({
    userId: req.auth?.userId as never,
    primaryRole: profile.primaryRole,
    ratingWeight: Math.max(
      profile.ratings.batting.rating,
      profile.ratings.bowling.rating,
      profile.ratings.fielding.rating
    ),
    joinedAt: new Date()
  });
  if (match.registrations.length >= match.playerLimit) match.status = "full";
  await match.save();
  res.status(201).json({ data: match });
});

openMatchRouter.post("/:matchId/form-teams", requireAuth, async (req: AuthRequest, res) => {
  const match = await OpenMatch.findById(req.params.matchId);
  if (!match) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Open match not found" } });
  if (String(match.creatorId) !== req.auth?.userId) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only the match creator can form teams" } });
  if (match.teamMode === "fixed") return res.status(409).json({ error: { code: "FIXED_TEAM_MODE", message: "Fixed-team matches require manual team assignment" } });

  const roleOrder: Record<string, number> = { Batter: 1, Bowler: 2, "All-rounder": 3, Wicketkeeper: 4, "Wicketkeeper-Batter": 5 };
  const players = [...match.registrations].sort((a, b) =>
    b.ratingWeight - a.ratingWeight ||
    (roleOrder[b.primaryRole] ?? 0) - (roleOrder[a.primaryRole] ?? 0)
  );
  const teamA: typeof match.teams.teamA = [];
  const teamB: typeof match.teams.teamB = [];
  let weightA = 0;
  let weightB = 0;
  for (const player of players) {
    if (weightA <= weightB) {
      teamA.push(player.userId);
      weightA += player.ratingWeight;
    } else {
      teamB.push(player.userId);
      weightB += player.ratingWeight;
    }
  }
  match.teams.teamA = teamA;
  match.teams.teamB = teamB;
  await match.save();
  res.json({ data: { teams: match.teams, estimatedTeamWeights: { teamA: weightA, teamB: weightB } } });
});
