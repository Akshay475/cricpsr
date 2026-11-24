import { connectDatabase } from "../src/config/database.js";
import { District, State, Zone } from "../src/models/Location.js";

await connectDatabase();

const state = await State.findOneAndUpdate(
  { code: "PB" },
  { $set: { name: "Punjab", code: "PB", active: true } },
  { upsert: true, new: true }
);

const district = await District.findOneAndUpdate(
  { stateId: state._id, name: "Ludhiana" },
  { $set: { stateId: state._id, name: "Ludhiana", active: true } },
  { upsert: true, new: true }
);

const zone = await Zone.findOneAndUpdate(
  { districtId: district._id, name: "Zone 1" },
  { $set: { districtId: district._id, name: "Zone 1", localAreas: ["Central Ludhiana"], active: true } },
  { upsert: true, new: true }
);

console.log(JSON.stringify({
  stateId: String(state._id),
  districtId: String(district._id),
  zoneId: String(zone._id)
}));

await import("mongoose").then(({ default: mongoose }) => mongoose.disconnect());
