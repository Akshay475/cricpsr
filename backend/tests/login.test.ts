import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCESS_TOKEN_KEY, loginAndNavigate } from "../../frontend/lib/auth.js";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";

const app = createApp();

describe("login flow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("authenticates, stores the access token, and navigates to the dashboard", async () => {
    const user = {
      _id: "64b000000000000000000001",
      fullName: "Test Player",
      email: "player@example.com",
      mobile: "9876543210",
      roles: ["player"],
      status: "active",
      verifyPassword: vi.fn().mockResolvedValue(true)
    };
    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockResolvedValue(user)
    } as never);

    const tokens = new Map<string, string>();
    const navigation: string[] = [];
    await loginAndNavigate("PLAYER@example.com", "correct-password", {
      apiUrl: "/api/",
      storage: { setItem: (key, value) => tokens.set(key, value) },
      navigate: (path) => navigation.push(path),
      fetcher: async (url, init) => {
        const response = await request(app)
          .post(String(url))
          .set("Content-Type", "application/json")
          .send(init?.body as string);
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        });
      }
    });

    const token = tokens.get(ACCESS_TOKEN_KEY);
    expect(token).toBeTruthy();
    expect(jwt.verify(token!, env.JWT_ACCESS_SECRET)).toMatchObject({
      sub: user._id,
      roles: user.roles
    });
    expect(user.verifyPassword).toHaveBeenCalledWith("correct-password");
    expect(navigation).toEqual(["/dashboard"]);
  });

  it("does not create a session or navigate when credentials are rejected", async () => {
    const user = {
      _id: "64b000000000000000000001",
      fullName: "Test Player",
      email: "player@example.com",
      mobile: "9876543210",
      roles: ["player"],
      status: "active",
      verifyPassword: vi.fn().mockResolvedValue(false)
    };
    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockResolvedValue(user)
    } as never);

    const tokens = new Map<string, string>();
    const navigation: string[] = [];
    await expect(loginAndNavigate("player@example.com", "wrong-password", {
      apiUrl: "/api",
      storage: { setItem: (key, value) => tokens.set(key, value) },
      navigate: (path) => navigation.push(path),
      fetcher: async (url, init) => {
        const response = await request(app)
          .post(String(url))
          .set("Content-Type", "application/json")
          .send(init?.body as string);
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        });
      }
    })).rejects.toThrow("Invalid email/mobile or password");

    expect(tokens.size).toBe(0);
    expect(navigation).toEqual([]);
  });
});
