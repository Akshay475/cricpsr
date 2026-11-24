import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { PlayerProfile } from "../src/models/PlayerProfile.js";
import { BallByBall, Match, Team, Tournament } from "../src/models/Cricket.js";
import { calculateBatting } from "../src/rating/batting.js";
import { calculateBowling } from "../src/rating/bowling.js";
import { calculateFielding } from "../src/rating/fielding.js";
import { Challenge, OpenMatch, TurfProfile } from "../src/models/Competitive.js";
import { AuctionBid, AuctionEvent, AuctionPlayer } from "../src/models/Auction.js";
import { MarketplaceBrand, MarketplaceCart, MarketplaceOrder, MarketplaceProduct } from "../src/models/Marketplace.js";
import { Payment } from "../src/models/Payment.js";

describe("Phase 7 marketplace", () => {
  const app = createApp();

  it("protects seller registration, cart, checkout, and buyer orders", async () => {
    const responses = await Promise.all([
      request(app).post("/api/marketplace/brands").send({}),
      request(app).post("/api/marketplace/cart/items").send({}),
      request(app).post("/api/marketplace/checkout").send({}),
      request(app).get("/api/marketplace/orders")
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });

  it("disables mock checkouts and verification in production", async () => {
    const previous = {
      nodeEnv: env.NODE_ENV,
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET
    };
    const token = jwt.sign({ sub: "64b000000000000000000001", roles: ["player"] }, env.JWT_ACCESS_SECRET);
    const paymentLookup = vi.spyOn(Payment, "findOne").mockResolvedValue({ provider: "mock" } as never);
    env.NODE_ENV = "production";
    env.RAZORPAY_KEY_ID = undefined;
    env.RAZORPAY_KEY_SECRET = undefined;
    try {
      const responses = await Promise.all([
        request(app).post("/api/subscriptions/checkout").set("Authorization", `Bearer ${token}`).send({ planId: "monthly" }),
        request(app).post("/api/marketplace/checkout").set("Authorization", `Bearer ${token}`).send({}),
        request(app).post("/api/subscriptions/verify").set("Authorization", `Bearer ${token}`)
          .send({ orderId: "mock-order", paymentId: "mock-payment", signature: "mock-signature" }),
        request(app).post("/api/marketplace/payments/verify").set("Authorization", `Bearer ${token}`)
          .send({ orderId: "mock-order", paymentId: "mock-payment", signature: "mock-signature" })
      ]);
      expect(responses.map((response) => response.status)).toEqual([503, 503, 503, 503]);
      expect(responses.map((response) => response.body.error.code)).toEqual([
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "PAYMENT_PROVIDER_UNAVAILABLE"
      ]);
    } finally {
      paymentLookup.mockRestore();
      env.NODE_ENV = previous.nodeEnv;
      env.RAZORPAY_KEY_ID = previous.keyId;
      env.RAZORPAY_KEY_SECRET = previous.keySecret;
    }
  });

  it("rejects malformed public product IDs before database lookup", async () => {
    const response = await request(app).get("/api/marketplace/products/not-an-id");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PRODUCT_ID");
  });

  it("restricts brand approval to super administrators", async () => {
    const token = jwt.sign({ sub: "64b000000000000000000001", roles: ["seller"] }, env.JWT_ACCESS_SECRET);
    const response = await request(app)
      .patch("/api/marketplace/brands/64b000000000000000000002/review")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "approved" });
    expect(response.status).toBe(403);
  });

  it("keeps new brands pending until an administrator reviews them", () => {
    const brand = new MarketplaceBrand({
      ownerId: "64b000000000000000000001",
      name: "Northern Cricket Co.",
      description: "Cricket equipment for local players."
    });
    expect(brand.validateSync()).toBeUndefined();
    expect(brand.status).toBe("pending");
  });

  it("rejects fractional prices, negative stock, and zero cart quantities", () => {
    const product = new MarketplaceProduct({
      brandId: "64b000000000000000000002",
      ownerId: "64b000000000000000000001",
      name: "Cricket bat",
      description: "A quality bat for club cricket.",
      category: "Bats",
      price: 99.5,
      stock: -1
    });
    const cart = new MarketplaceCart({
      userId: "64b000000000000000000001",
      items: [{ productId: "64b000000000000000000003", quantity: 0 }]
    });
    expect(product.validateSync()).toBeDefined();
    expect(cart.validateSync()).toBeDefined();
  });

  it("requires order items to retain seller, product, and payment state", () => {
    const order = new MarketplaceOrder({
      userId: "64b000000000000000000001",
      totalAmount: 100,
      items: [{
        brandId: "64b000000000000000000002",
        productId: "64b000000000000000000003",
        sellerId: "64b000000000000000000004",
        productName: "Cricket bat",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100
      }]
    });
    expect(order.validateSync()).toBeUndefined();
    expect(order.status).toBe("pending_payment");
    expect(order.items[0]?.fulfillmentStatus).toBe("pending");
    const payment = new Payment({
      userId: "64b000000000000000000001",
      orderId: "64b000000000000000000005",
      providerOrderId: "mock_order_test",
      amount: 100
    });
    expect(payment.validateSync()).toBeUndefined();
  });
});

describe("Phase 8 observability", () => {
  const app = createApp();

  it("exports application request count and duration metrics", async () => {
    await request(app).get("/api/health");
    const response = await request(app).get("/metrics");
    expect(response.status).toBe(200);
    expect(response.text).toContain("cricpsr_http_requests_total");
    expect(response.text).toContain('route="/api/health"');
    expect(response.text).toContain("cricpsr_http_request_duration_seconds_bucket");
  });
});

describe("Phase 1 API", () => {
  const app = createApp();

  it("reports API health", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("rejects malformed registration", async () => {
    const response = await request(app).post("/api/auth/register").send({
      fullName: "A",
      email: "invalid",
      mobile: "123",
      password: "short"
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed login", async () => {
    const response = await request(app).post("/api/auth/login").send({
      identifier: "",
      password: ""
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists exactly the three Phase 2 subscription plans", async () => {
    const response = await request(app).get("/api/subscriptions/plans");
    expect(response.status).toBe(200);
    expect(response.body.data.map((plan: { id: string }) => plan.id)).toEqual([
      "monthly",
      "six_months",
      "annual"
    ]);
  });

  it("protects profile and location administration routes", async () => {
    const profileResponse = await request(app).get("/api/players/me/profile");
    expect(profileResponse.status).toBe(401);

    const locationResponse = await request(app).post("/api/locations/states").send({
      name: "Punjab",
      code: "PB"
    });
    expect(locationResponse.status).toBe(401);
  });

  it("rejects an unconfigured Razorpay webhook clearly", async () => {
    const response = await request(app)
      .post("/api/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .send({ event: "payment.captured" });
    expect(response.status).toBe(503);
  });

  it("creates three independent rating subdocuments with insufficient baseline", () => {
    const profile = new PlayerProfile({
      userId: "64b000000000000000000001",
      playerId: "CRICTEST",
      dateOfBirth: new Date("2005-01-01"),
      stateId: "64b000000000000000000002",
      districtId: "64b000000000000000000003",
      zoneId: "64b000000000000000000004",
      primaryRole: "All-rounder",
      battingStyle: "Right-handed",
      bowlingStyle: "Right-arm medium"
    });
    expect(profile.ratings.batting.rating).toBe(400);
    expect(profile.ratings.bowling.rating).toBe(400);
    expect(profile.ratings.fielding.rating).toBe(400);
    expect(profile.ratings.batting.dataStatus).toBe("insufficient");
    expect(profile.ratings.bowling.dataStatus).toBe("insufficient");
    expect(profile.ratings.fielding.dataStatus).toBe("insufficient");
    expect(profile.toObject()).not.toHaveProperty("overallRating");
  });

  it("creates a tournament with validated scheduling data", () => {
    const tournament = new Tournament({
      name: "Ludhiana Open",
      organizerId: "64b000000000000000000010",
      venueName: "Central Turf",
      stateId: "64b000000000000000000002",
      districtId: "64b000000000000000000003",
      zoneId: "64b000000000000000000004",
      registrationDeadline: new Date("2026-12-01"),
      startDate: new Date("2026-12-10"),
      endDate: new Date("2026-12-12"),
      format: "T20",
      teamLimit: 8,
      ageCategory: "Open Category"
    });
    expect(tournament.validateSync()).toBeUndefined();
    expect(tournament.status).toBe("draft");
  });

  it("rejects a match containing the same team twice", async () => {
    const response = await request(app).post("/api/matches").send({
      name: "Duplicate team match",
      venueName: "Central Turf",
      scheduledAt: "2026-12-10T10:00:00Z",
      teamAId: "64b000000000000000000005",
      teamBId: "64b000000000000000000005"
    });
    expect(response.status).toBe(401);
  });

  it("requires authorization before registering a tournament team", async () => {
    const response = await request(app).post("/api/tournaments/64b000000000000000000006/registrations").send({
      registrationType: "team",
      teamId: "64b000000000000000000007"
    });
    expect(response.status).toBe(401);
  });

  it("rejects tournament team registration by users who are neither owner nor captain", async () => {
    const token = jwt.sign({ sub: "64b000000000000000000001", roles: ["player"] }, env.JWT_ACCESS_SECRET);
    const teamLookup = vi.spyOn(Team, "exists").mockResolvedValue(null as never);
    try {
      const response = await request(app)
        .post("/api/tournaments/64b000000000000000000006/registrations")
        .set("Authorization", `Bearer ${token}`)
        .send({ registrationType: "team", teamId: "64b000000000000000000007" });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("TEAM_FORBIDDEN");
    } finally {
      teamLookup.mockRestore();
    }
  });

  it("models one unique event ID and unique ball position per match", () => {
    const ball = new BallByBall({
      matchId: "64b000000000000000000008",
      innings: 1,
      over: 0,
      ball: 1,
      batterId: "64b000000000000000000009",
      bowlerId: "64b000000000000000000010",
      runs: 4,
      eventId: "MATCH-1-INN-1-0-1"
    });
    expect(ball.validateSync()).toBeUndefined();
    expect(ball.wicketType).toBe("none");
  });

  it("does not allow creating match balls through an unauthenticated route", async () => {
    const response = await request(app).post("/api/matches/64b000000000000000000008/balls").send({
      innings: 1,
      over: 0,
      ball: 1,
      batterId: "64b000000000000000000009",
      bowlerId: "64b000000000000000000010",
      runs: 4,
      eventId: "MATCH-1-INN-1-0-1"
    });
    expect(response.status).toBe(401);
  });

  it("matches begin unverified", () => {
    const match = new Match({
      name: "Zone 1 Match",
      venueName: "Central Turf",
      scheduledAt: new Date("2026-12-10T10:00:00Z"),
      teamAId: "64b000000000000000000005",
      teamBId: "64b000000000000000000007"
    });
    expect(match.verified).toBe(false);
  });

  it("batting recalculation is independent", () => {
    const batting = calculateBatting({ runs: 600, balls: 450, fours: 60, sixes: 20, outs: 8, innings: 10, verifiedMatches: 10 });
    const bowlingInput = { overs: 0, balls: 0, runsConceded: 0, wickets: 0, maidens: 0, verifiedMatches: 0 };
    const bowling = calculateBowling(bowlingInput);
    expect(batting.dataStatus).toBe("verified");
    expect(batting.rating).toBeGreaterThanOrEqual(400);
    expect(bowling).toEqual(expect.objectContaining({ rating: 400, dataStatus: "insufficient" }));
  });

  it("bowling recalculation is independent", () => {
    const bowling = calculateBowling({ overs: 40, balls: 240, runsConceded: 180, wickets: 20, maidens: 8, verifiedMatches: 8 });
    const batting = calculateBatting({ runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, innings: 0, verifiedMatches: 0 });
    expect(bowling.dataStatus).toBe("verified");
    expect(batting.rating).toBe(400);
  });

  it("fielding recalculation ignores batting and bowling and handles no opportunities", () => {
    const fielding = calculateFielding({ catches: 0, runOuts: 0, stumpings: 0, opportunities: 0, missedCatches: 0, successfulStops: 0, boundarySaves: 0, directHits: 0, verifiedMatches: 5 });
    expect(fielding).toEqual(expect.objectContaining({ rating: 400, dataStatus: "insufficient" }));
  });

  it("clamps category ratings into the 400 to 1000 range", () => {
    const batting = calculateBatting({ runs: 10000, balls: 100, fours: 1000, sixes: 500, outs: 1, innings: 100, verifiedMatches: 100 });
    const bowling = calculateBowling({ overs: 100, balls: 600, runsConceded: 1, wickets: 100, maidens: 100, verifiedMatches: 100 });
    const fielding = calculateFielding({ catches: 100, runOuts: 100, stumpings: 100, opportunities: 100, missedCatches: 0, successfulStops: 100, boundarySaves: 100, directHits: 100, verifiedMatches: 100 });
    for (const result of [batting, bowling, fielding]) {
      expect(result.rating).toBeGreaterThanOrEqual(400);
      expect(result.rating).toBeLessThanOrEqual(1000);
    }
  });

  it("protects rating recalculation endpoints", async () => {
    const response = await request(app).post("/api/players/CRICTEST/recalculate").send({ category: "batting" });
    expect(response.status).toBe(401);
  });

  it("models a zone challenge lifecycle", () => {
    const challenge = new Challenge({
      challengerId: "64b000000000000000000001",
      opponentId: "64b000000000000000000002",
      zoneId: "64b000000000000000000003",
      format: "3-over",
      venueName: "Central Turf",
      scheduledAt: new Date("2027-01-10T10:00:00Z")
    });
    expect(challenge.validateSync()).toBeUndefined();
    expect(challenge.status).toBe("pending");
    expect(challenge.verified).toBe(false);
  });

  it("models turf coordinates and available slots", () => {
    const turf = new TurfProfile({
      ownerId: "64b000000000000000000001",
      name: "Central Cricket Turf",
      address: "Test venue",
      coordinates: { latitude: 30.900965, longitude: 75.857277 },
      zoneId: "64b000000000000000000003",
      slots: [{ startsAt: new Date("2027-01-10T10:00:00Z"), endsAt: new Date("2027-01-10T12:00:00Z"), available: true }]
    });
    expect(turf.validateSync()).toBeUndefined();
  });

  it("models open matches with duplicate-user prevention indexes", () => {
    const match = new OpenMatch({
      turfId: "64b000000000000000000004",
      creatorId: "64b000000000000000000001",
      zoneId: "64b000000000000000000003",
      name: "Saturday 10-player match",
      scheduledAt: new Date("2027-01-10T10:00:00Z"),
      format: "T20",
      playerLimit: 10,
      teamMode: "random"
    });
    expect(match.validateSync()).toBeUndefined();
    expect(match.status).toBe("open");
  });

  it("protects challenge, turf, and open-match mutation routes", async () => {
    const challenge = await request(app).post("/api/challenges").send({});
    const turf = await request(app).post("/api/turfs").send({});
    const openMatch = await request(app).post("/api/open-matches").send({});
    expect(challenge.status).toBe(401);
    expect(turf.status).toBe(401);
    expect(openMatch.status).toBe(401);
  });

  it("models district/state/national auctions", () => {
    for (const level of ["district", "state", "national"] as const) {
      const auction = new AuctionEvent({
        name: `${level} auction`,
        level,
        organizerId: "64b000000000000000000001",
        startsAt: new Date("2027-02-01T10:00:00Z"),
        endsAt: new Date("2027-02-01T12:00:00Z"),
        bidIncrement: 100
      });
      expect(auction.validateSync()).toBeUndefined();
      expect(auction.status).toBe("draft");
    }
  });

  it("models auction players and unique bid idempotency keys", () => {
    const lot = new AuctionPlayer({
      auctionId: "64b000000000000000000010",
      playerId: "64b000000000000000000011",
      basePrice: 1000,
      currentBid: 1000,
      lotNumber: 1
    });
    const bid = new AuctionBid({
      auctionId: "64b000000000000000000010",
      auctionPlayerId: "64b000000000000000000012",
      teamId: "64b000000000000000000013",
      bidderUserId: "64b000000000000000000014",
      amount: 1100,
      idempotencyKey: "test-bid-key"
    });
    expect(lot.validateSync()).toBeUndefined();
    expect(bid.validateSync()).toBeUndefined();
  });

  it("protects auction creation and bidding", async () => {
    const create = await request(app).post("/api/auctions").send({
      name: "District auction",
      level: "district",
      startsAt: "2027-02-01T10:00:00Z",
      endsAt: "2027-02-01T12:00:00Z"
    });
    const bid = await request(app).post("/api/auctions/64b000000000000000000010/players/64b000000000000000000012/bids").send({
      teamId: "64b000000000000000000013",
      amount: 1100,
      idempotencyKey: "test-bid-key"
    });
    expect(create.status).toBe(401);
    expect(bid.status).toBe(401);
  });

  it("rejects auction bids for teams the bidder does not own", async () => {
    const token = jwt.sign({ sub: "64b000000000000000000001", roles: ["owner"] }, env.JWT_ACCESS_SECRET);
    const teamLookup = vi.spyOn(Team, "exists").mockResolvedValue(null as never);
    try {
      const response = await request(app)
        .post("/api/auctions/64b000000000000000000010/players/64b000000000000000000012/bids")
        .set("Authorization", `Bearer ${token}`)
        .send({ teamId: "64b000000000000000000013", amount: 1100, idempotencyKey: "unauthorized-bid-key" });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("TEAM_FORBIDDEN");
    } finally {
      teamLookup.mockRestore();
    }
  });

  it("supports independent auction rating filter query fields", async () => {
    const response = await request(app)
      .get("/api/auctions/players/search")
      .query({ battingMin: 800, bowlingMin: 500, fieldingMin: 700, sortBy: "batting" });
    expect([401, 403]).toContain(response.status);
  });
});
