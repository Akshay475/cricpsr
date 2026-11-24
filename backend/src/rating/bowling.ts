export type BowlingInput = {
  overs: number;
  balls: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  verifiedMatches: number;
};

export const BOWLING_VERSION = "bowling-deterministic-v1";

export function calculateBowling(input: BowlingInput) {
  const sufficient = input.verifiedMatches >= 5 && input.balls >= 30;
  if (!sufficient) {
    return { rating: 400, dataStatus: "insufficient" as const, verifiedMatches: input.verifiedMatches, explanation: "Insufficient verified bowling data; 400 is a baseline, not a verified 400.", contributors: [] };
  }
  const economy = input.runsConceded * 6 / Math.max(1, input.balls);
  const average = input.runsConceded / Math.max(1, input.wickets);
  const strikeRate = input.balls / Math.max(1, input.wickets);
  const economyScore = Math.max(0, 150 - economy * 12);
  const averageScore = Math.max(0, 150 - average * 3);
  const strikeScore = Math.max(0, 150 - strikeRate * 2);
  const maidenScore = Math.min(150, input.maidens * 12);
  const rating = Math.max(400, Math.min(1000, Math.round(400 + economyScore + averageScore + strikeScore + maidenScore)));
  const contributors = [
    { metric: "economy", value: Number(economy.toFixed(2)) },
    { metric: "bowling_average", value: Number(average.toFixed(2)) },
    { metric: "bowling_strike_rate", value: Number(strikeRate.toFixed(2)) },
    { metric: "maidens", value: input.maidens }
  ];
  return { rating, dataStatus: "verified" as const, verifiedMatches: input.verifiedMatches, explanation: "Rating is based only on verified bowling overs, runs, wickets, strike rate, economy, and maidens.", contributors };
}
