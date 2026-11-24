import mongoose from "mongoose";

const challengeSchema = new mongoose.Schema({
  challengerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  opponentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true, index: true },
  format: { type: String, enum: ["1-over", "3-over", "5-over"], required: true },
  venueName: { type: String, required: true, trim: true },
  scheduledAt: { type: Date, required: true },
  status: { type: String, enum: ["pending", "accepted", "rejected", "completed", "cancelled"], default: "pending", index: true },
  result: { type: String, maxlength: 500 },
  verified: { type: Boolean, default: false },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });
challengeSchema.index({ challengerId: 1, opponentId: 1, scheduledAt: 1 });

const turfSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  coordinates: { latitude: { type: Number, required: true }, longitude: { type: Number, required: true } },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true, index: true },
  description: { type: String, maxlength: 3000 },
  verified: { type: Boolean, default: false },
  slots: [{
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    available: { type: Boolean, default: true }
  }]
}, { timestamps: true });
turfSchema.index({ zoneId: 1, verified: 1 });

const openMatchSchema = new mongoose.Schema({
  turfId: { type: mongoose.Schema.Types.ObjectId, ref: "TurfProfile", required: true, index: true },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true, index: true },
  name: { type: String, required: true, trim: true },
  scheduledAt: { type: Date, required: true },
  format: { type: String, enum: ["1-over", "3-over", "5-over", "T20", "Custom"], required: true },
  playerLimit: { type: Number, required: true, min: 2, max: 22 },
  joiningFee: { type: Number, min: 0, default: 0 },
  teamMode: { type: String, enum: ["random", "fixed"], default: "random" },
  status: { type: String, enum: ["open", "full", "in_progress", "completed", "cancelled"], default: "open", index: true },
  registrations: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    primaryRole: { type: String, enum: ["Batter", "Bowler", "All-rounder", "Wicketkeeper", "Wicketkeeper-Batter"], required: true },
    ratingWeight: { type: Number, min: 400, max: 1000, default: 400 },
    joinedAt: { type: Date, default: Date.now }
  }],
  teams: {
    teamA: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    teamB: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  }
}, { timestamps: true });
openMatchSchema.index({ turfId: 1, scheduledAt: 1 });
openMatchSchema.index({ zoneId: 1, status: 1, scheduledAt: 1 });

export const Challenge = mongoose.models.Challenge || mongoose.model("Challenge", challengeSchema);
export const TurfProfile = mongoose.models.TurfProfile || mongoose.model("TurfProfile", turfSchema);
export const OpenMatch = mongoose.models.OpenMatch || mongoose.model("OpenMatch", openMatchSchema);
