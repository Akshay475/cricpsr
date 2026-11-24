import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema({
  rating: { type: Number, min: 400, max: 1000, default: 400 },
  dataStatus: { type: String, enum: ["insufficient", "verified"], default: "insufficient" },
  verifiedMatches: { type: Number, min: 0, default: 0 },
  lastCalculatedAt: Date,
  calculationVersion: { type: String, default: "phase2-placeholder-v1" }
}, { _id: false });

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  playerId: { type: String, required: true, unique: true, index: true },
  dateOfBirth: { type: Date, required: true },
  ageCategory: { type: String, enum: ["Under 14", "Under 16", "Under 19", "Under 23", "Open Category", "Common Category"], required: true },
  stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State", required: true, index: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true, index: true },
  localArea: { type: String, trim: true },
  primaryRole: { type: String, enum: ["Batter", "Bowler", "All-rounder", "Wicketkeeper", "Wicketkeeper-Batter"], required: true },
  battingStyle: { type: String, enum: ["Right-handed", "Left-handed"], required: true },
  bowlingStyle: { type: String, enum: ["Right-arm fast", "Left-arm fast", "Right-arm medium", "Left-arm medium", "Right-arm spin", "Left-arm spin", "Does not bowl"], required: true },
  cricketExperience: { type: String, trim: true, maxlength: 2000 },
  publicProfile: { type: Boolean, default: true },
  profilePhotoUrl: String,
  ratings: {
    batting: { type: ratingSchema, default: () => ({}) },
    bowling: { type: ratingSchema, default: () => ({}) },
    fielding: { type: ratingSchema, default: () => ({}) }
  }
}, { timestamps: true });

profileSchema.index({ stateId: 1, districtId: 1, zoneId: 1, primaryRole: 1 });

export const PlayerProfile = mongoose.models.PlayerProfile || mongoose.model("PlayerProfile", profileSchema);
export type PlayerProfileDocument = InstanceType<typeof PlayerProfile>;
