import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { District, State, Zone } from "../models/Location.js";

export const locationRouter = Router();

locationRouter.get("/states", async (_req, res) => {
  res.json({ data: await State.find({ active: true }).sort({ name: 1 }) });
});

locationRouter.get("/states/:stateId/districts", async (req, res) => {
  res.json({ data: await District.find({ stateId: req.params.stateId, active: true }).sort({ name: 1 }) });
});

locationRouter.get("/districts/:districtId/zones", async (req, res) => {
  res.json({ data: await Zone.find({ districtId: req.params.districtId, active: true }).sort({ name: 1 }) });
});

const stateSchema = z.object({ name: z.string().trim().min(2), code: z.string().trim().min(2).max(10) });
const districtSchema = z.object({ stateId: z.string().min(1), name: z.string().trim().min(2) });
const zoneSchema = z.object({ districtId: z.string().min(1), name: z.string().trim().min(1), localAreas: z.array(z.string().trim().min(1)).default([]) });

locationRouter.post("/states", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = stateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const state = await State.create(parsed.data);
  res.status(201).json({ data: state });
});

locationRouter.post("/districts", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = districtSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const district = await District.create(parsed.data);
  res.status(201).json({ data: district });
});

locationRouter.post("/zones", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = zoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const zone = await Zone.create(parsed.data);
  res.status(201).json({ data: zone });
});
