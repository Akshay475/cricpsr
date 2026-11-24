import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { Challenge } from "../models/Competitive.js";
import { PlayerProfile } from "../models/PlayerProfile.js";

export const challengeRouter = Router();

const challengeSchema = z.object({
  opponentId: z.string().min(1),
  zoneId: z.string().min(1),
  format: z.enum(["1-over", "3-over", "5-over"]),
  venueName: z.string().trim().min(2),
  scheduledAt: z.coerce.date()
}).refine((value) => value.scheduledAt > new Date(), { message: "Challenge time must be in the future", path: ["scheduledAt"] });

challengeRouter.get("/", requireAuth, async (req: AuthRequest, res) => {
  const challenges = await Challenge.find({
    $or: [{ challengerId: req.auth?.userId }, { opponentId: req.auth?.userId }]
  }).sort({ scheduledAt: 1 });
  res.json({ data: challenges });
});

challengeRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = challengeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  if (parsed.data.opponentId === req.auth?.userId) return res.status(400).json({ error: { code: "INVALID_OPONENT", message: "A player cannot challenge themselves" } });

  const opponent = await PlayerProfile.findOne({ userId: parsed.data.opponentId });
  if (!opponent) return res.status(404).json({ error: { code: "OPPONENT_NOT_FOUND", message: "Opponent has no player profile" } });
  if (String(opponent.zoneId) !== parsed.data.zoneId) return res.status(400).json({ error: { code: "ZONE_MISMATCH", message: "Opponent is outside the selected zone" } });

  const challenge = await Challenge.create({ ...parsed.data, challengerId: req.auth?.userId });
  res.status(201).json({ data: challenge });
});

challengeRouter.patch("/:challengeId/status", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["accepted", "rejected", "cancelled", "completed"]), result: z.string().trim().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const challenge = await Challenge.findById(req.params.challengeId);
  if (!challenge) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge not found" } });

  const isChallenger = String(challenge.challengerId) === req.auth?.userId;
  const isOpponent = String(challenge.opponentId) === req.auth?.userId;
  if (!isChallenger && !isOpponent) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only challenge participants can update the challenge" } });
  if ((parsed.data.status === "accepted" || parsed.data.status === "rejected") && !isOpponent) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only the opponent can accept or reject" } });
  }
  if (parsed.data.status === "completed" && !parsed.data.result) {
    return res.status(400).json({ error: { code: "RESULT_REQUIRED", message: "A result is required before completion" } });
  }

  challenge.status = parsed.data.status;
  if (parsed.data.result) challenge.result = parsed.data.result;
  await challenge.save();
  res.json({ data: challenge });
});

challengeRouter.post("/:challengeId/verify", requireAuth, async (req: AuthRequest, res) => {
  const challenge = await Challenge.findById(req.params.challengeId);
  if (!challenge) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge not found" } });
  if (!req.auth?.roles.some((role) => ["districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"].includes(role))) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only administrators can verify challenge results" } });
  }
  if (challenge.status !== "completed") return res.status(409).json({ error: { code: "NOT_COMPLETED", message: "Challenge result must be completed before verification" } });
  challenge.verified = true;
  challenge.verifiedBy = req.auth.userId as never;
  await challenge.save();
  res.json({ data: challenge });
});

challengeRouter.get("/head-to-head/:playerAId/:playerBId", requireAuth, async (req, res) => {
  const { playerAId, playerBId } = req.params;
  const challenges = await Challenge.find({
    verified: true,
    $or: [
      { challengerId: playerAId, opponentId: playerBId },
      { challengerId: playerBId, opponentId: playerAId }
    ]
  }).sort({ scheduledAt: -1 });
  res.json({
    data: {
      matches: challenges.length,
      completed: challenges.filter((challenge) => challenge.status === "completed").length,
      history: challenges
    }
  });
});
