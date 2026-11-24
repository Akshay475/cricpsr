import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:27017/cricpsr_test",
      JWT_ACCESS_SECRET: "test-secret-that-is-at-least-32-characters",
      FRONTEND_URL: "http://localhost:3000"
    }
  }
});
