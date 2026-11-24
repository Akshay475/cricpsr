import { Router } from "express";
import { z } from "zod";
import { Match, PlayerMatchStatistics } from "../models/Cricket.js";
import { PlayerProfile, type PlayerProfileDocument } from "../models/PlayerProfile.js";
import { PlayerRatingHistory, PlayerRanking } from "../models/Rating.js";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { BATTING_VERSION, calculateBatting } from "../rating/batting.js";
import { BOWLING_VERSION, calculateBowling } from "../rating/bowling.js";
import { FIELDING_VERSION, calculateFielding } from "../rating/fielding.js";

export const ratingRouter = Router();
export const rankingRouter = Router();

function paramString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

async function findProfile(playerId: string) {
  if (/^[a-f\d]{24}$/i.test(playerId)) {
    return PlayerProfile.findOne({ $or: [{ playerId }, { _id: playerId }] });
  }
  return PlayerProfile.findOne({ playerId });
}

async function verifiedStats(profile: PlayerProfileDocument) {
  const verifiedMatches = await Match.find({ verified: true }).distinct("_id");
  return PlayerMatchStatistics.find({
    playerId: profile.userId,
    matchId: { $in: verifiedMatches }
  }).sort({ createdAt: 1 });
}

async function calculateAndStore(profile: PlayerProfileDocument, category: "batting" | "bowling" | "fielding") {
  const stats = await verifiedStats(profile);
  const previous = profile.ratings[category];
  let result: {
    rating: number;
    dataStatus: "insufficient" | "verified";
    verifiedMatches: number;
    explanation: string;
    contributors: Array<{ metric: string; value: number }>;
  };
  let version: string;

  if (category === "batting") {
    const aggregate = stats.reduce((acc, stat) => ({
      runs: acc.runs + stat.batting.runs,
      balls: acc.balls + stat.batting.balls,
      fours: acc.fours + stat.batting.fours,
      sixes: acc.sixes + stat.batting.sixes,
      outs: acc.outs + (stat.batting.out ? 1 : 0),
      innings: acc.innings + (stat.batting.balls > 0 ? 1 : 0),
      verifiedMatches: acc.verifiedMatches
    }), { runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, innings: 0, verifiedMatches: stats.length });
    result = calculateBatting(aggregate);
    version = BATTING_VERSION;
  } else if (category === "bowling") {
    const aggregate = stats.reduce((acc, stat) => ({
      overs: acc.overs + stat.bowling.overs,
      balls: acc.balls + stat.bowling.balls,
      runsConceded: acc.runsConceded + stat.bowling.runsConceded,
      wickets: acc.wickets + stat.bowling.wickets,
      maidens: acc.maidens + stat.bowling.maidens,
      verifiedMatches: acc.verifiedMatches
    }), { overs: 0, balls: 0, runsConceded: 0, wickets: 0, maidens: 0, verifiedMatches: stats.length });
    result = calculateBowling(aggregate);
    version = BOWLING_VERSION;
  } else {
    const aggregate = stats.reduce((acc, stat) => ({
      catches: acc.catches + stat.fielding.catches,
      runOuts: acc.runOuts + stat.fielding.runOuts,
      stumpings: acc.stumpings + stat.fielding.stumpings,
      opportunities: acc.opportunities + stat.fielding.opportunities,
      missedCatches: acc.missedCatches + stat.fielding.missedCatches,
      successfulStops: acc.successfulStops + stat.fielding.successfulStops,
      boundarySaves: acc.boundarySaves + stat.fielding.boundarySaves,
      directHits: acc.directHits + stat.fielding.directHits,
      verifiedMatches: acc.verifiedMatches
    }), { catches: 0, runOuts: 0, stumpings: 0, opportunities: 0, missedCatches: 0, successfulStops: 0, boundarySaves: 0, directHits: 0, verifiedMatches: stats.length });
    result = calculateFielding(aggregate);
    version = FIELDING_VERSION;
  }

  const now = new Date();
  profile.ratings[category].set({
    rating: result.rating,
    dataStatus: result.dataStatus,
    verifiedMatches: result.verifiedMatches,
    lastCalculatedAt: now,
    calculationVersion: version
  });
  await profile.save();
  await PlayerRatingHistory.create({
    playerId: profile._id,
    category,
    previousRating: previous.rating,
    newRating: result.rating,
    calculationVersion: version,
    inputStatisticsReference: stats.map((stat) => String(stat._id)).join(",") || "none",
    dataStatus: result.dataStatus,
    explanation: result.explanation,
    verifiedMatches: result.verifiedMatches
  });
  return { ...result, calculationVersion: version, lastCalculatedAt: now };
}

ratingRouter.get("/:playerId/ratings", async (req, res) => {
  const profile = await findProfile(paramString(req.params.playerId));
  if (!profile) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Player not found" } });
  res.json({ data: profile.ratings });
});

for (const category of ["batting", "bowling", "fielding"] as const) {
  ratingRouter.get("/:playerId/ratings/" + category, async (req, res) => {
    const profile = await findProfile(paramString(req.params.playerId));
    if (!profile) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Player not found" } });
    res.json({ data: profile.ratings[category] });
  });
}

ratingRouter.get("/:playerId/ratings/history", async (req, res) => {
  const profile = await findProfile(paramString(req.params.playerId));
  if (!profile) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Player not found" } });
  const history = await PlayerRatingHistory.find({ playerId: profile._id }).sort({ createdAt: -1 });
  res.json({ data: history });
});

ratingRouter.get("/:playerId/ratings/history/:category", async (req, res) => {
  const category = paramString(req.params.category);
  if (!["batting", "bowling", "fielding"].includes(category)) {
    return res.status(400).json({ error: { code: "INVALID_CATEGORY", message: "Category must be batting, bowling, or fielding" } });
  }
  const profile = await findProfile(paramString(req.params.playerId));
  if (!profile) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Player not found" } });
  const history = await PlayerRatingHistory.find({ playerId: profile._id, category }).sort({ createdAt: -1 });
  res.json({ data: history });
});

const recalculationSchema = z.object({
  category: z.enum(["batting", "bowling", "fielding"])
});

ratingRouter.post("/:playerId/recalculate", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = recalculationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const profile = await findProfile(paramString(req.params.playerId));
  if (!profile) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Player not found" } });
  const result = await calculateAndStore(profile, parsed.data.category);
  res.json({ data: result });
});

rankingRouter.get("/:category", async (req, res) => {
  const categoryParam = paramString(req.params.category);
  if (!["batting", "bowling", "fielding"].includes(categoryParam)) {
    return res.status(400).json({ error: { code: "INVALID_CATEGORY", message: "Category must be batting, bowling, or fielding" } });
  }
  const category = categoryParam as "batting" | "bowling" | "fielding";
  const profiles = await PlayerProfile.find({ [`ratings.${category}.dataStatus`]: "verified" })
    .sort({ [`ratings.${category}.rating`]: -1 })
    .limit(100);
  const data = profiles.map((profile, index) => ({
    rank: index + 1,
    playerId: profile.playerId,
    rating: profile.ratings[category].rating,
    verifiedMatches: profile.ratings[category].verifiedMatches
  }));
  res.json({ data });
});
