import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { BallByBall, Match, PlayerMatchStatistics, Team } from "../models/Cricket.js";

export const matchRouter = Router();

const matchSchema = z.object({
  tournamentId: z.string().optional(),
  name: z.string().trim().min(2).max(150),
  venueName: z.string().trim().min(2),
  scheduledAt: z.coerce.date(),
  teamAId: z.string().min(1),
  teamBId: z.string().min(1)
}).refine((value) => value.teamAId !== value.teamBId, { message: "The two teams must be different", path: ["teamBId"] });

matchRouter.post("/", requireAuth, requireRole("organizer", "districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const teams = await Team.find({ _id: { $in: [parsed.data.teamAId, parsed.data.teamBId] } });
  if (teams.length !== 2) return res.status(400).json({ error: { code: "INVALID_TEAM", message: "Both match teams must exist" } });
  const match = await Match.create(parsed.data);
  res.status(201).json({ data: match });
});

matchRouter.get("/", async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.tournamentId) filter.tournamentId = req.query.tournamentId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.verified !== undefined) filter.verified = req.query.verified === "true";
  const matches = await Match.find(filter).sort({ scheduledAt: 1 }).populate("teamAId teamBId winnerTeamId");
  res.json({ data: matches });
});

const ballSchema = z.object({
  innings: z.number().int().min(1).max(2),
  over: z.number().int().min(0),
  ball: z.number().int().min(1).max(6),
  batterId: z.string().min(1),
  bowlerId: z.string().min(1),
  runs: z.number().int().min(0).max(7),
  extras: z.number().int().min(0).max(7).default(0),
  wicketType: z.enum(["none", "bowled", "caught", "lbw", "run_out", "stumped", "hit_wicket", "retired", "other"]).default("none"),
  dismissedPlayerId: z.string().optional(),
  fielderId: z.string().optional(),
  eventId: z.string().trim().min(1)
});

matchRouter.post("/:matchId/balls", requireAuth, requireRole("organizer", "districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = ballSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const match = await Match.findById(req.params.matchId);
  if (!match) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Match not found" } });
  if (match.verified) return res.status(409).json({ error: { code: "MATCH_VERIFIED", message: "Verified match balls cannot be modified" } });
  try {
    const ball = await BallByBall.create({ matchId: match._id, ...parsed.data });
    await Match.findByIdAndUpdate(match._id, { status: "live" });
    res.status(201).json({ data: ball });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: { code: "DUPLICATE_BALL", message: "This ball event already exists" } });
    throw error;
  }
});

matchRouter.get("/:matchId/scorecard", async (req, res) => {
  const [match, balls, statistics] = await Promise.all([
    Match.findById(req.params.matchId).populate("teamAId teamBId winnerTeamId"),
    BallByBall.find({ matchId: req.params.matchId }).sort({ innings: 1, over: 1, ball: 1 }),
    PlayerMatchStatistics.find({ matchId: req.params.matchId }).sort({ playerId: 1 })
  ]);
  if (!match) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Match not found" } });
  res.json({ data: { match, balls, playerStatistics: statistics } });
});

const statisticsSchema = z.object({
  playerId: z.string().min(1),
  batting: z.object({ runs: z.number().int().min(0).default(0), balls: z.number().int().min(0).default(0), fours: z.number().int().min(0).default(0), sixes: z.number().int().min(0).default(0), out: z.boolean().default(false) }).default({ runs: 0, balls: 0, fours: 0, sixes: 0, out: false }),
  bowling: z.object({ overs: z.number().min(0).default(0), balls: z.number().int().min(0).default(0), runsConceded: z.number().int().min(0).default(0), wickets: z.number().int().min(0).default(0), maidens: z.number().int().min(0).default(0) }).default({ overs: 0, balls: 0, runsConceded: 0, wickets: 0, maidens: 0 }),
  fielding: z.object({ catches: z.number().int().min(0).default(0), runOuts: z.number().int().min(0).default(0), stumpings: z.number().int().min(0).default(0), missedCatches: z.number().int().min(0).default(0) }).default({ catches: 0, runOuts: 0, stumpings: 0, missedCatches: 0 })
});

matchRouter.put("/:matchId/statistics", requireAuth, requireRole("organizer", "districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = statisticsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const match = await Match.findById(req.params.matchId);
  if (!match) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Match not found" } });
  if (match.verified) return res.status(409).json({ error: { code: "MATCH_VERIFIED", message: "Verified match statistics cannot be modified" } });
  const statistics = await PlayerMatchStatistics.findOneAndUpdate(
    { matchId: match._id, playerId: parsed.data.playerId },
    { $set: parsed.data },
    { upsert: true, new: true, runValidators: true }
  );
  res.json({ data: statistics });
});

const resultSchema = z.object({
  status: z.enum(["scheduled", "live", "completed", "cancelled"]),
  result: z.string().trim().max(500).optional(),
  winnerTeamId: z.string().optional()
});

matchRouter.patch("/:matchId/status", requireAuth, requireRole("organizer", "districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const match = await Match.findByIdAndUpdate(req.params.matchId, { $set: parsed.data }, { new: true, runValidators: true });
  if (!match) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Match not found" } });
  res.json({ data: match });
});

matchRouter.post("/:matchId/verify", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req: AuthRequest, res) => {
  const match = await Match.findById(req.params.matchId);
  if (!match) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Match not found" } });
  if (match.status !== "completed") return res.status(409).json({ error: { code: "MATCH_NOT_COMPLETED", message: "Only completed matches can be verified" } });
  const verified = await Match.findByIdAndUpdate(
    match._id,
    { $set: { verified: true, verifiedBy: req.auth?.userId, verifiedAt: new Date() } },
    { new: true }
  );
  res.json({ data: verified });
});
