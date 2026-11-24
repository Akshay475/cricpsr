import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  captainId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true, index: true },
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["captain", "player"], default: "player" },
    status: { type: String, enum: ["invited", "active", "removed"], default: "active" }
  }],
  status: { type: String, enum: ["active", "inactive"], default: "active" }
}, { timestamps: true });
teamSchema.index({ name: 1, zoneId: 1 }, { unique: true });

const tournamentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  organizerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  posterUrl: String,
  venueName: { type: String, required: true },
  coordinates: { latitude: Number, longitude: Number },
  stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State", required: true, index: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true, index: true },
  registrationDeadline: { type: Date, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  format: { type: String, enum: ["T20", "ODI", "Test", "Other"], required: true },
  teamLimit: { type: Number, required: true, min: 2 },
  entryFee: { type: Number, min: 0, default: 0 },
  prizeMoney: { type: Number, min: 0, default: 0 },
  rules: { type: String, maxlength: 10000 },
  ageCategory: { type: String, enum: ["Under 14", "Under 16", "Under 19", "Under 23", "Open Category", "Common Category"], required: true },
  status: { type: String, enum: ["draft", "open", "closed", "completed"], default: "draft" }
}, { timestamps: true });
tournamentSchema.index({ districtId: 1, zoneId: 1, startDate: 1 });

const registrationSchema = new mongoose.Schema({
  tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament", required: true, index: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });
registrationSchema.index({ tournamentId: 1, teamId: 1 }, { unique: true, sparse: true });
registrationSchema.index({ tournamentId: 1, playerId: 1 }, { unique: true, sparse: true });

const matchSchema = new mongoose.Schema({
  tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament", index: true },
  name: { type: String, required: true },
  venueName: { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  teamAId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
  teamBId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
  status: { type: String, enum: ["scheduled", "live", "completed", "cancelled"], default: "scheduled", index: true },
  result: { type: String, trim: true },
  winnerTeamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
  verified: { type: Boolean, default: false, index: true },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  verifiedAt: Date
}, { timestamps: true });
matchSchema.index({ tournamentId: 1, scheduledAt: 1 });

const ballSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true, index: true },
  innings: { type: Number, required: true, min: 1, max: 2 },
  over: { type: Number, required: true, min: 0 },
  ball: { type: Number, required: true, min: 1, max: 6 },
  batterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bowlerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  runs: { type: Number, required: true, min: 0, max: 7 },
  extras: { type: Number, min: 0, max: 7, default: 0 },
  wicketType: { type: String, enum: ["none", "bowled", "caught", "lbw", "run_out", "stumped", "hit_wicket", "retired", "other"], default: "none" },
  dismissedPlayerId: mongoose.Schema.Types.ObjectId,
  fielderId: mongoose.Schema.Types.ObjectId,
  eventId: { type: String, required: true, unique: true }
}, { timestamps: true });
ballSchema.index({ matchId: 1, innings: 1, over: 1, ball: 1 }, { unique: true });

const playerStatsSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true, index: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  batting: { runs: { type: Number, default: 0 }, balls: { type: Number, default: 0 }, fours: { type: Number, default: 0 }, sixes: { type: Number, default: 0 }, out: { type: Boolean, default: false } },
  bowling: { overs: { type: Number, default: 0 }, balls: { type: Number, default: 0 }, runsConceded: { type: Number, default: 0 }, wickets: { type: Number, default: 0 }, maidens: { type: Number, default: 0 } },
  fielding: {
    catches: { type: Number, default: 0 },
    runOuts: { type: Number, default: 0 },
    stumpings: { type: Number, default: 0 },
    missedCatches: { type: Number, default: 0 },
    opportunities: { type: Number, default: 0 },
    successfulStops: { type: Number, default: 0 },
    boundarySaves: { type: Number, default: 0 },
    directHits: { type: Number, default: 0 }
  }
}, { timestamps: true });
playerStatsSchema.index({ matchId: 1, playerId: 1 }, { unique: true });

export const Team = mongoose.models.Team || mongoose.model("Team", teamSchema);
export const Tournament = mongoose.models.Tournament || mongoose.model("Tournament", tournamentSchema);
export const TournamentRegistration = mongoose.models.TournamentRegistration || mongoose.model("TournamentRegistration", registrationSchema);
export const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
export const BallByBall = mongoose.models.BallByBall || mongoose.model("BallByBall", ballSchema);
export const PlayerMatchStatistics = mongoose.models.PlayerMatchStatistics || mongoose.model("PlayerMatchStatistics", playerStatsSchema);
