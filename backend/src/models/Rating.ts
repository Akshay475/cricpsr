import mongoose from "mongoose";

const historySchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: "PlayerProfile", required: true, index: true },
  category: { type: String, enum: ["batting", "bowling", "fielding"], required: true, index: true },
  previousRating: { type: Number, min: 400, max: 1000, required: true },
  newRating: { type: Number, min: 400, max: 1000, required: true },
  calculationVersion: { type: String, required: true },
  inputStatisticsReference: { type: String, required: true },
  dataStatus: { type: String, enum: ["insufficient", "verified"], required: true },
  explanation: { type: String, required: true },
  verifiedMatches: { type: Number, min: 0, default: 0 }
}, { timestamps: true });
historySchema.index({ playerId: 1, category: 1, createdAt: -1 });

const rankingSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: "PlayerProfile", required: true, index: true },
  category: { type: String, enum: ["batting", "bowling", "fielding", "all_rounder", "wicketkeeper", "consistent_batter", "consistent_bowler", "most_improved"], required: true, index: true },
  rating: { type: Number, min: 400, max: 1000, required: true },
  rank: { type: Number, min: 1 },
  level: { type: String, enum: ["zone", "district", "state", "national"], required: true, index: true },
  levelId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  ageCategory: { type: String },
  calculationVersion: { type: String, required: true }
}, { timestamps: true });
rankingSchema.index({ category: 1, level: 1, levelId: 1, rating: -1 });

export const PlayerRatingHistory = mongoose.models.PlayerRatingHistory || mongoose.model("PlayerRatingHistory", historySchema);
export const PlayerRanking = mongoose.models.PlayerRanking || mongoose.model("PlayerRanking", rankingSchema);
