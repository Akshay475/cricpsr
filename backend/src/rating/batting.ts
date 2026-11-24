export type BattingInput = {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  outs: number;
  innings: number;
  verifiedMatches: number;
};

export const BATTING_VERSION = "batting-deterministic-v1";

export function calculateBatting(input: BattingInput) {
  const sufficient = input.verifiedMatches >= 5 && input.innings >= 3 && input.balls >= 30;
  if (!sufficient) {
    return { rating: 400, dataStatus: "insufficient" as const, verifiedMatches: input.verifiedMatches, explanation: "Insufficient verified batting data; 400 is a baseline, not a verified 400.", contributors: [] };
  }
  const average = input.runs / Math.max(1, input.outs);
  const strikeRate = input.runs * 100 / Math.max(1, input.balls);
  const boundaryRate = (input.fours * 4 + input.sixes * 6) * 100 / Math.max(1, input.runs);
  const score = 400
    + Math.min(250, average * 5)
    + Math.min(200, strikeRate * 1.25)
    + Math.min(150, boundaryRate * 2);
  const rating = Math.max(400, Math.min(1000, Math.round(score)));
  const contributors = [
    { metric: "batting_average", value: Number(average.toFixed(2)) },
    { metric: "strike_rate", value: Number(strikeRate.toFixed(2)) },
    { metric: "boundary_rate", value: Number(boundaryRate.toFixed(2)) }
  ];
  return { rating, dataStatus: "verified" as const, verifiedMatches: input.verifiedMatches, explanation: "Rating is based only on verified batting runs, balls, outs, boundaries, and innings.", contributors };
}
