export function isMockPaymentsAllowed(nodeEnv: "development" | "test" | "production"): boolean {
  return nodeEnv !== "production";
}
