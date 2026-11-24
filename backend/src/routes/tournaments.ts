import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { PlayerProfile } from "../models/PlayerProfile.js";
import { Team, Tournament, TournamentRegistration } from "../models/Cricket.js";

export const tournamentRouter = Router();

const tournamentSchema = z.object({
  name: z.string().trim().min(2).max(150),
  posterUrl: z.string().url().optional(),
  venueName: z.string().trim().min(2),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  stateId: z.string().min(1),
  districtId: z.string().min(1),
  zoneId: z.string().min(1),
  registrationDeadline: z.coerce.date(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  format: z.enum(["T20", "ODI", "Test", "Other"]),
  teamLimit: z.number().int().min(2),
  entryFee: z.number().min(0).default(0),
  prizeMoney: z.number().min(0).default(0),
  rules: z.string().max(10000).optional(),
  ageCategory: z.enum(["Under 14", "Under 16", "Under 19", "Under 23", "Open Category", "Common Category"])
}).refine((value) => value.endDate >= value.startDate, { message: "End date must not precede start date", path: ["endDate"] });

tournamentRouter.post("/", requireAuth, requireRole("organizer", "districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req: AuthRequest, res) => {
  const parsed = tournamentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const tournament = await Tournament.create({
    ...parsed.data,
    organizerId: req.auth?.userId,
    coordinates: parsed.data.latitude !== undefined || parsed.data.longitude !== undefined
      ? { latitude: parsed.data.latitude, longitude: parsed.data.longitude }
      : undefined,
    status: "draft"
  });
  res.status(201).json({ data: tournament });
});

tournamentRouter.get("/", async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.zoneId) filter.zoneId = req.query.zoneId;
  if (req.query.districtId) filter.districtId = req.query.districtId;
  if (req.query.ageCategory) filter.ageCategory = req.query.ageCategory;
  const tournaments = await Tournament.find(filter).sort({ startDate: 1 });
  res.json({ data: tournaments });
});

const registrationSchema = z.object({
  teamId: z.string().optional(),
  registrationType: z.enum(["team", "individual"])
});

tournamentRouter.post("/:tournamentId/registrations", requireAuth, async (req: AuthRequest, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  if (parsed.data.registrationType === "team" && !parsed.data.teamId) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "teamId is required for team registration" } });
  }
  if (parsed.data.registrationType === "team" &&
      !(await Team.exists({
        _id: parsed.data.teamId,
        $or: [{ ownerId: req.auth?.userId }, { captainId: req.auth?.userId }]
      }))) {
    return res.status(403).json({ error: { code: "TEAM_FORBIDDEN", message: "Only the team owner or captain can register it" } });
  }
  const tournament = await Tournament.findById(req.params.tournamentId);
  if (!tournament) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Tournament not found" } });
  if (tournament.status !== "open") return res.status(409).json({ error: { code: "REGISTRATION_CLOSED", message: "Tournament registration is not open" } });
  if (tournament.registrationDeadline < new Date()) return res.status(409).json({ error: { code: "DEADLINE_PASSED", message: "Registration deadline has passed" } });

  const profile = await PlayerProfile.findOne({ userId: req.auth?.userId });
  if (parsed.data.registrationType === "individual" && !profile) {
    return res.status(400).json({ error: { code: "PROFILE_REQUIRED", message: "Create a player profile before registering" } });
  }
  const existingCount = await TournamentRegistration.countDocuments({
    tournamentId: tournament._id,
    status: { $ne: "rejected" }
  });
  if (existingCount >= tournament.teamLimit) return res.status(409).json({ error: { code: "TOURNAMENT_FULL", message: "Tournament registration limit reached" } });

  try {
    const registration = await TournamentRegistration.create({
      tournamentId: tournament._id,
      teamId: parsed.data.registrationType === "team" ? parsed.data.teamId : undefined,
      playerId: parsed.data.registrationType === "individual" ? req.auth?.userId : undefined
    });
    res.status(201).json({ data: registration });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: { code: "ALREADY_REGISTERED", message: "Registration already exists" } });
    throw error;
  }
});

tournamentRouter.patch("/:tournamentId/registrations/:registrationId", requireAuth, requireRole("organizer", "districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["approved", "rejected", "pending"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const registration = await TournamentRegistration.findOneAndUpdate(
    { _id: req.params.registrationId, tournamentId: req.params.tournamentId },
    { $set: { status: parsed.data.status, approvedBy: req.auth?.userId } },
    { new: true }
  );
  if (!registration) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Registration not found" } });
  res.json({ data: registration });
});

tournamentRouter.patch("/:tournamentId/status", requireAuth, requireRole("organizer", "districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = z.object({ status: z.enum(["draft", "open", "closed", "completed"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const tournament = await Tournament.findByIdAndUpdate(req.params.tournamentId, { status: parsed.data.status }, { new: true });
  if (!tournament) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Tournament not found" } });
  res.json({ data: tournament });
});
