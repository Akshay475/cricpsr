import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { AuctionBid, AuctionEvent, AuctionPlayer } from "../models/Auction.js";
import { Team } from "../models/Cricket.js";
import { PlayerProfile } from "../models/PlayerProfile.js";
import { emitAuctionBid, emitAuctionSelection } from "../sockets/auction.js";

export const auctionRouter = Router();

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

type TeamBudgetItem = {
  teamId: unknown;
  budget: number;
  spent: number;
  squadLimit: number;
  playerIds: unknown[];
};

const eventSchema = z.object({
  name: z.string().trim().min(2),
  level: z.enum(["district", "state", "national"]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  bidIncrement: z.number().int().min(1).default(100),
  stateId: z.string().optional(),
  districtId: z.string().optional(),
  zoneId: z.string().optional(),
  teamBudgets: z.array(z.object({
    teamId: z.string().min(1),
    budget: z.number().min(0),
    squadLimit: z.number().int().min(1)
  })).default([])
}).refine((value) => value.endsAt > value.startsAt, { message: "Auction end must follow start", path: ["endsAt"] });

auctionRouter.post("/", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req: AuthRequest, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const event = await AuctionEvent.create({
    ...parsed.data,
    organizerId: req.auth?.userId,
    status: "draft",
    teamBudgets: parsed.data.teamBudgets.map((team) => ({
      teamId: team.teamId,
      budget: team.budget,
      spent: 0,
      squadLimit: team.squadLimit,
      playerIds: []
    }))
  });
  res.status(201).json({ data: event });
});

auctionRouter.get("/", async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.level) filter.level = req.query.level;
  if (req.query.status) filter.status = req.query.status;
  const events = await AuctionEvent.find(filter).sort({ startsAt: -1 });
  res.json({ data: events });
});

auctionRouter.patch("/:auctionId/status", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = z.object({ status: z.enum(["draft", "scheduled", "live", "completed", "cancelled"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const event = await AuctionEvent.findByIdAndUpdate(routeParam(req.params.auctionId), { status: parsed.data.status }, { new: true, runValidators: true });
  if (!event) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Auction not found" } });
  res.json({ data: event });
});

auctionRouter.get("/players/search", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin", "owner"), async (req, res) => {
  const filter: Record<string, unknown> = { publicProfile: true };
  if (req.query.primaryRole) filter.primaryRole = req.query.primaryRole;
  if (req.query.ageCategory) filter.ageCategory = req.query.ageCategory;
  if (req.query.districtId) filter.districtId = req.query.districtId;
  if (req.query.zoneId) filter.zoneId = req.query.zoneId;
  if (req.query.battingMin) filter["ratings.batting.rating"] = { $gte: Number(req.query.battingMin) };
  if (req.query.bowlingMin) filter["ratings.bowling.rating"] = { $gte: Number(req.query.bowlingMin) };
  if (req.query.fieldingMin) filter["ratings.fielding.rating"] = { $gte: Number(req.query.fieldingMin) };

  const profiles = await PlayerProfile.find(filter).sort({
    ...(req.query.sortBy === "batting" ? { "ratings.batting.rating": -1 as const } : {}),
    ...(req.query.sortBy === "bowling" ? { "ratings.bowling.rating": -1 as const } : {}),
    ...(req.query.sortBy === "fielding" ? { "ratings.fielding.rating": -1 as const } : {})
  }).limit(100);
  res.json({ data: profiles });
});

const playerSchema = z.object({
  playerId: z.string().min(1),
  basePrice: z.number().min(0),
  lotNumber: z.number().int().min(1)
});

auctionRouter.post("/:auctionId/players", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = playerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  const event = await AuctionEvent.findById(routeParam(req.params.auctionId));
  if (!event) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Auction not found" } });
  const profile = await PlayerProfile.findById(parsed.data.playerId);
  if (!profile) return res.status(404).json({ error: { code: "PLAYER_NOT_FOUND", message: "Player not found" } });
  const lot = await AuctionPlayer.create({
    auctionId: event._id,
    playerId: profile._id,
    basePrice: parsed.data.basePrice,
    currentBid: parsed.data.basePrice,
    lotNumber: parsed.data.lotNumber,
    status: "approved"
  });
  await AuctionEvent.findByIdAndUpdate(event._id, { $addToSet: { approvedPlayerIds: profile._id } });
  res.status(201).json({ data: lot });
});

auctionRouter.get("/:auctionId/players", async (req, res) => {
  const lots = await AuctionPlayer.find({ auctionId: routeParam(req.params.auctionId) })
    .populate("playerId")
    .sort({ lotNumber: 1 });
  res.json({ data: lots });
});

const bidSchema = z.object({
  teamId: z.string().min(1),
  amount: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(1)
});

auctionRouter.post("/:auctionId/players/:lotId/bids", requireAuth, requireRole("owner", "superAdmin"), async (req: AuthRequest, res) => {
  const parsed = bidSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  if (!req.auth?.roles.includes("superAdmin") &&
      !(await Team.exists({ _id: parsed.data.teamId, ownerId: req.auth?.userId }))) {
    return res.status(403).json({ error: { code: "TEAM_FORBIDDEN", message: "You can only bid for a team you own" } });
  }
  const existing = await AuctionBid.findOne({ idempotencyKey: parsed.data.idempotencyKey });
  if (existing) return res.status(200).json({ data: existing, idempotent: true });

  const session = await mongoose.startSession();
  try {
    let bidResult: unknown;
    await session.withTransaction(async () => {
      const event = await AuctionEvent.findById(routeParam(req.params.auctionId)).session(session);
      if (!event) throw Object.assign(new Error("Auction not found"), { status: 404, code: "NOT_FOUND" });
      if (event.status !== "live") throw Object.assign(new Error("Auction is not live"), { status: 409, code: "AUCTION_NOT_LIVE" });
      if (new Date() > event.endsAt) throw Object.assign(new Error("Auction has ended"), { status: 409, code: "AUCTION_ENDED" });

      const lot = await AuctionPlayer.findById(routeParam(req.params.lotId)).session(session);
      if (!lot || String(lot.auctionId) !== String(event._id)) throw Object.assign(new Error("Auction player not found"), { status: 404, code: "LOT_NOT_FOUND" });
      if (lot.status !== "on_block") throw Object.assign(new Error("Player is not on the block"), { status: 409, code: "LOT_NOT_OPEN" });

      const budget = (event.teamBudgets as unknown as TeamBudgetItem[]).find((item: TeamBudgetItem) => String(item.teamId) === parsed.data.teamId);
      if (!budget) throw Object.assign(new Error("Team is not registered in this auction"), { status: 403, code: "TEAM_NOT_REGISTERED" });
      if (budget.playerIds.length >= budget.squadLimit) throw Object.assign(new Error("Team squad limit reached"), { status: 409, code: "SQUAD_FULL" });
      const requiredMinimum = lot.currentBid + event.bidIncrement;
      if (parsed.data.amount < requiredMinimum) throw Object.assign(new Error(`Bid must be at least ${requiredMinimum}`), { status: 400, code: "BID_TOO_LOW" });
      if (budget.budget - budget.spent < parsed.data.amount) throw Object.assign(new Error("Insufficient team budget"), { status: 409, code: "INSUFFICIENT_BUDGET" });

      const bid = await AuctionBid.create([{
        auctionId: event._id,
        auctionPlayerId: lot._id,
        teamId: parsed.data.teamId,
        bidderUserId: req.auth?.userId,
        amount: parsed.data.amount,
        idempotencyKey: parsed.data.idempotencyKey
      }], { session });
      lot.currentBid = parsed.data.amount;
      lot.currentBidTeamId = parsed.data.teamId as never;
      await lot.save({ session });
      bidResult = bid[0];
    });
    emitAuctionBid(routeParam(req.params.auctionId), bidResult);
    res.status(201).json({ data: bidResult });
  } catch (error) {
    const caught = error as Error & { status?: number; code?: string };
    res.status(caught.status ?? 500).json({ error: { code: caught.code ?? "INTERNAL_ERROR", message: caught.message } });
  } finally {
    await session.endSession();
  }
});

const selectionSchema = z.object({
  status: z.enum(["sold", "unsold"]),
  teamId: z.string().optional()
});

auctionRouter.post("/:auctionId/players/:lotId/selection", requireAuth, requireRole("districtAdmin", "stateAdmin", "nationalAdmin", "superAdmin"), async (req, res) => {
  const parsed = selectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });

  const session = await mongoose.startSession();
  try {
    let result: unknown;
    await session.withTransaction(async () => {
      const event = await AuctionEvent.findById(routeParam(req.params.auctionId)).session(session);
      const lot = await AuctionPlayer.findById(routeParam(req.params.lotId)).session(session);
      if (!event || !lot) throw Object.assign(new Error("Auction or player lot not found"), { status: 404, code: "NOT_FOUND" });
      if (parsed.data.status === "sold") {
        if (!parsed.data.teamId) throw Object.assign(new Error("Team is required for sold players"), { status: 400, code: "TEAM_REQUIRED" });
        const budget = (event.teamBudgets as unknown as TeamBudgetItem[]).find((item: TeamBudgetItem) => String(item.teamId) === parsed.data.teamId);
        if (!budget) throw Object.assign(new Error("Team is not registered"), { status: 403, code: "TEAM_NOT_REGISTERED" });
        if (budget.budget - budget.spent < lot.currentBid) throw Object.assign(new Error("Insufficient team budget"), { status: 409, code: "INSUFFICIENT_BUDGET" });
        if (budget.playerIds.length >= budget.squadLimit) throw Object.assign(new Error("Team squad limit reached"), { status: 409, code: "SQUAD_FULL" });
        budget.spent += lot.currentBid;
        budget.playerIds.push(lot.playerId);
        lot.status = "sold";
        lot.soldTeamId = parsed.data.teamId as never;
        lot.soldPrice = lot.currentBid;
      } else {
        lot.status = "unsold";
        lot.soldTeamId = undefined;
        lot.soldPrice = undefined;
      }
      await event.save({ session });
      await lot.save({ session });
      result = lot;
    });
    emitAuctionSelection(routeParam(req.params.auctionId), result);
    res.json({ data: result });
  } catch (error) {
    const caught = error as Error & { status?: number; code?: string };
    res.status(caught.status ?? 500).json({ error: { code: caught.code ?? "INTERNAL_ERROR", message: caught.message } });
  } finally {
    await session.endSession();
  }
});
