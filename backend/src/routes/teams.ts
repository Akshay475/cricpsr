import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { Team } from "../models/Cricket.js";

export const teamRouter = Router();

const teamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  captainId: z.string().min(1),
  zoneId: z.string().min(1)
});

teamRouter.post("/", requireAuth, requireRole("captain", "owner", "superAdmin"), async (req: AuthRequest, res) => {
  const parsed = teamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const team = await Team.create({
    ...parsed.data,
    ownerId: req.auth?.userId,
    members: [{ userId: parsed.data.captainId, role: "captain", status: "active" }]
  });
  res.status(201).json({ data: team });
});

teamRouter.get("/", requireAuth, async (req: AuthRequest, res) => {
  const teams = await Team.find({
    $or: [{ ownerId: req.auth?.userId }, { "members.userId": req.auth?.userId }]
  }).sort({ createdAt: -1 });
  res.json({ data: teams });
});

const memberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["captain", "player"]).default("player")
});

teamRouter.post("/:teamId/members", requireAuth, async (req: AuthRequest, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const team = await Team.findById(req.params.teamId);
  if (!team) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Team not found" } });
  if (String(team.ownerId) !== req.auth?.userId && String(team.captainId) !== req.auth?.userId) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only the team owner or captain can manage roster" } });
  }
  if (team.members.some((member: { userId: unknown }) => String(member.userId) === parsed.data.userId)) {
    return res.status(409).json({ error: { code: "MEMBER_EXISTS", message: "Player is already associated with the team" } });
  }
  team.members.push({ userId: parsed.data.userId as never, role: parsed.data.role, status: "active" });
  await team.save();
  res.status(201).json({ data: team });
});
