import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { District, State, Zone } from "../models/Location.js";
import { PlayerProfile } from "../models/PlayerProfile.js";

export const playerRouter = Router();

const profileSchema = z.object({
  dateOfBirth: z.coerce.date(),
  stateId: z.string().min(1),
  districtId: z.string().min(1),
  zoneId: z.string().min(1),
  localArea: z.string().trim().max(100).optional(),
  primaryRole: z.enum(["Batter", "Bowler", "All-rounder", "Wicketkeeper", "Wicketkeeper-Batter"]),
  battingStyle: z.enum(["Right-handed", "Left-handed"]),
  bowlingStyle: z.enum(["Right-arm fast", "Left-arm fast", "Right-arm medium", "Left-arm medium", "Right-arm spin", "Left-arm spin", "Does not bowl"]),
  cricketExperience: z.string().trim().max(2000).optional(),
  publicProfile: z.boolean().default(true),
  profilePhotoUrl: z.string().url().optional()
});

function ageCategory(date: Date): "Under 14" | "Under 16" | "Under 19" | "Under 23" | "Open Category" | "Common Category" {
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  if (today.getUTCMonth() < date.getUTCMonth() || (today.getUTCMonth() === date.getUTCMonth() && today.getUTCDate() < date.getUTCDate())) age--;
  if (age < 14) return "Under 14";
  if (age < 16) return "Under 16";
  if (age < 19) return "Under 19";
  if (age < 23) return "Under 23";
  return "Open Category";
}

playerRouter.get("/me/profile", requireAuth, async (req: AuthRequest, res) => {
  const profile = await PlayerProfile.findOne({ userId: req.auth?.userId }).populate("stateId districtId zoneId");
  if (!profile) return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Player profile has not been created" } });
  res.json({ data: profile });
});

playerRouter.put("/me/profile", requireAuth, async (req: AuthRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });

  const [state, district, zone] = await Promise.all([
    State.findById(parsed.data.stateId),
    District.findById(parsed.data.districtId),
    Zone.findById(parsed.data.zoneId)
  ]);
  if (!state || !district || !zone) return res.status(400).json({ error: { code: "INVALID_LOCATION", message: "State, district, or zone is invalid" } });
  if (String(district.stateId) !== String(state._id) || String(zone.districtId) !== String(district._id)) {
    return res.status(400).json({ error: { code: "INVALID_LOCATION", message: "Location hierarchy does not match" } });
  }

  const profile = await PlayerProfile.findOneAndUpdate(
    { userId: req.auth?.userId },
    {
      $set: {
        ...parsed.data,
        ageCategory: ageCategory(parsed.data.dateOfBirth)
      },
      $setOnInsert: {
        playerId: `CRIC${crypto.randomBytes(4).toString("hex").toUpperCase()}`
      }
    },
    { upsert: true, new: true, runValidators: true }
  ).populate("stateId districtId zoneId");
  res.json({ data: profile });
});

playerRouter.get("/:playerId", async (req, res) => {
  const profile = await PlayerProfile.findOne({ playerId: req.params.playerId, publicProfile: true }).populate("stateId districtId zoneId");
  if (!profile) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Public player profile not found" } });
  res.json({ data: profile });
});
