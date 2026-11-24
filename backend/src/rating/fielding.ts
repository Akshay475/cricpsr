export type FieldingInput = {
  catches: number;
  runOuts: number;
  stumpings: number;
  opportunities: number;
  missedCatches: number;
  successfulStops: number;
  boundarySaves: number;
  directHits: number;
  verifiedMatches: number;
};

export const FIELDING_VERSION = "fielding-deterministic-v1";

export function calculateFielding(input: FieldingInput) {
  if (input.opportunities === 0) {
    return { rating: 400, dataStatus: "insufficient" as const, verifiedMatches: input.verifiedMatches, explanation: "No fielding opportunities were recorded; the player is not penalized.", contributors: [] };
  }
  const sufficient = input.verifiedMatches >= 3 && input.opportunities >= 5;
  if (!sufficient) {
    return { rating: 400, dataStatus: "insufficient" as const, verifiedMatches: input.verifiedMatches, explanation: "Insufficient verified fielding opportunities; 400 is a baseline, not a verified 400.", contributors: [] };
  }
  const successful = input.catches + input.runOuts + input.stumpings + input.successfulStops + input.boundarySaves + input.directHits;
  const successRate = successful * 100 / Math.max(1, input.opportunities);
  const missedPenalty = input.missedCatches * 25;
  const rating = Math.max(400, Math.min(1000, Math.round(400 + successRate * 6 - missedPenalty)));
  const contributors = [
    { metric: "success_rate", value: Number(successRate.toFixed(2)) },
    { metric: "opportunities", value: input.opportunities },
    { metric: "missed_catches", value: input.missedCatches },
    { metric: "successful_actions", value: successful }
  ];
  return { rating, dataStatus: "verified" as const, verifiedMatches: input.verifiedMatches, explanation: "Rating is opportunity-adjusted and based only on verified fielding actions and missed catches.", contributors };
}
