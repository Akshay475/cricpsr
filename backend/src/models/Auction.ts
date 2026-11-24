import mongoose from "mongoose";

const teamBudgetSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
  budget: { type: Number, required: true, min: 0 },
  spent: { type: Number, default: 0, min: 0 },
  squadLimit: { type: Number, required: true, min: 1 },
  playerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "PlayerProfile" }]
}, { _id: false });

const auctionEventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  level: { type: String, enum: ["district", "state", "national"], required: true, index: true },
  organizerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  stateId: mongoose.Schema.Types.ObjectId,
  districtId: mongoose.Schema.Types.ObjectId,
  zoneId: mongoose.Schema.Types.ObjectId,
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  bidIncrement: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["draft", "scheduled", "live", "completed", "cancelled"], default: "draft", index: true },
  teamBudgets: { type: [teamBudgetSchema], default: [] },
  approvedPlayerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "PlayerProfile" }]
}, { timestamps: true });

const auctionPlayerSchema = new mongoose.Schema({
  auctionId: { type: mongoose.Schema.Types.ObjectId, ref: "AuctionEvent", required: true, index: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: "PlayerProfile", required: true, index: true },
  basePrice: { type: Number, required: true, min: 0 },
  currentBid: { type: Number, required: true, min: 0 },
  currentBidTeamId: mongoose.Schema.Types.ObjectId,
  status: { type: String, enum: ["approved", "unsold", "sold", "on_block", "withdrawn"], default: "approved", index: true },
  soldTeamId: mongoose.Schema.Types.ObjectId,
  soldPrice: Number,
  lotNumber: { type: Number, required: true, min: 1 }
}, { timestamps: true });
auctionPlayerSchema.index({ auctionId: 1, lotNumber: 1 }, { unique: true });
auctionPlayerSchema.index({ auctionId: 1, playerId: 1 }, { unique: true });

const auctionBidSchema = new mongoose.Schema({
  auctionId: { type: mongoose.Schema.Types.ObjectId, ref: "AuctionEvent", required: true, index: true },
  auctionPlayerId: { type: mongoose.Schema.Types.ObjectId, ref: "AuctionPlayer", required: true, index: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
  bidderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  accepted: { type: Boolean, default: true },
  idempotencyKey: { type: String, required: true, unique: true },
  acceptedAt: { type: Date, default: Date.now }
}, { timestamps: true });
auctionBidSchema.index({ auctionId: 1, auctionPlayerId: 1, amount: -1 });

export const AuctionEvent = mongoose.models.AuctionEvent || mongoose.model("AuctionEvent", auctionEventSchema);
export const AuctionPlayer = mongoose.models.AuctionPlayer || mongoose.model("AuctionPlayer", auctionPlayerSchema);
export const AuctionBid = mongoose.models.AuctionBid || mongoose.model("AuctionBid", auctionBidSchema);
