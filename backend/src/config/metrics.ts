import { collectDefaultMetrics, Counter, Histogram, Registry } from "@prometheus-io/client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

const httpRequests = new Counter({
  name: "cricpsr_http_requests_total",
  help: "Total HTTP requests served by CRICPSR",
  labelNames: ["method", "route", "status_code"],
  registers: [metricsRegistry]
});

const httpRequestDuration = new Histogram({
  name: "cricpsr_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry]
});

export function recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number): void {
  const labels = { method, route, status_code: String(statusCode) };
  httpRequests.inc(labels);
  httpRequestDuration.observe(labels, durationSeconds);
}
