/**
 * Basic k6 load test for Live View API and WebSocket.
 *
 * Prereq: npm install -g k6 (or use Docker: docker run -i loadimpact/k6 run - < scripts/load_test_k6.js)
 *
 * Run:
 *   k6 run scripts/load_test_k6.js
 *   k6 run --vus 50 --duration 30s scripts/load_test_k6.js
 *
 * Env:
 *   BASE_URL  default http://localhost:8000
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

export const options = {
  stages: [
    { duration: "10s", target: 20 },
    { duration: "20s", target: 50 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return { baseUrl: BASE_URL };
}

export default function (data) {
  const base = data.baseUrl;

  // REST: health and ready
  const health = http.get(`${base}/health`);
  check(health, { "health status 200": (r) => r.status === 200 });

  const ready = http.get(`${base}/ready`);
  check(ready, { "ready status 200": (r) => r.status === 200 });

  // REST: leagues list
  const leagues = http.get(`${base}/v1/leagues`);
  check(leagues, { "leagues status 200": (r) => r.status === 200 });

  // REST: today (if implemented)
  const today = http.get(`${base}/v1/today`);
  check(today, { "today status 200 or 404": (r) => r.status === 200 || r.status === 404 });

  sleep(0.5 + Math.random());
}
