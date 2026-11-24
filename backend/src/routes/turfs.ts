import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { TurfProfile } from "../models/Competitive.js";

export const turfRouter = Router();

const turfSchema = z.object({
  name: z.string().trim().min(2),
  address: z.string().trim().min(5),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  zoneId: z.string().min(1),
  description: z.string().trim().max(3000).optional()
});

turfRouter.get("/", async (req, res) => {
  const filter: Record<string, unknown> = { verified: true };
  if (req.query.zoneId) filter.zoneId = req.query.zoneId;
  res.json({ data: await TurfProfile.find(filter).sort({ name: 1 }) });
});

turfRouter.post("/", requireAuth, requireRole("owner", "turfOwner", "superAdmin"), async (req: AuthRequest, res) => {
  const parsed = turfSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const existing = await TurfProfile.findOne({ ownerId: req.auth?.userId });
  if (existing) return res.status(409).json({ error: { code: "TURF_EXISTS", message: "A turf profile already exists for this owner" } });
  const turf = await TurfProfile.create({
    ownerId: req.auth?.userId,
    name: parsed.data.name,
    address: parsed.data.address,
    coordinates: { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
    zoneId: parsed.data.zoneId,
    description: parsed.data.description
  });
  res.status(201).json({ data: turf });
});

turfRouter.put("/me", requireAuth, requireRole("owner", "turfOwner", "superAdmin"), async (req: AuthRequest, res) => {
  const parsed = turfSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const turf = await TurfProfile.findOneAndUpdate(
    { ownerId: req.auth?.userId },
    { $set: {
      name: parsed.data.name,
      address: parsed.data.address,
      coordinates: { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
      zoneId: parsed.data.zoneId,
      description: parsed.data.description
    } },
    { new: true, runValidators: true }
  );
  if (!turf) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Turf profile not found" } });
  res.json({ data: turf });
});

const slotSchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date()
}).refine((value) => value.endsAt > value.startsAt, { message: "Slot end must be after slot start", path: ["endsAt"] });

turfRouter.post("/me/slots", requireAuth, requireRole("owner", "turfOwner", "superAdmin"), async (req: AuthRequest, res) => {
  const parsed = slotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const turf = await TurfProfile.findOne({ ownerId: req.auth?.userId });
  if (!turf) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Turf profile not found" } });
  turf.slots.push({ ...parsed.data, available: true });
  await turf.save();
  res.status(201).json({ data: turf });
});
