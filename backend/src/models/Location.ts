import mongoose from "mongoose";

const stateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });
stateSchema.index({ name: 1 }, { unique: true });

const districtSchema = new mongoose.Schema({
  stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State", required: true, index: true },
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });
districtSchema.index({ stateId: 1, name: 1 }, { unique: true });

const zoneSchema = new mongoose.Schema({
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
  name: { type: String, required: true, trim: true },
  localAreas: [{ type: String, trim: true }],
  active: { type: Boolean, default: true }
}, { timestamps: true });
zoneSchema.index({ districtId: 1, name: 1 }, { unique: true });

export const State = mongoose.models.State || mongoose.model("State", stateSchema);
export const District = mongoose.models.District || mongoose.model("District", districtSchema);
export const Zone = mongoose.models.Zone || mongoose.model("Zone", zoneSchema);
