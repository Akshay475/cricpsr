import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";

export const authRouter = Router();

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  password: z.string().min(10).max(72)
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1).max(72)
});

function signToken(user: { _id: unknown; roles: unknown }) {
  return jwt.sign(
    { sub: String(user._id), roles: user.roles },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] }
  );
}

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    return;
  }
  const existing = await User.findOne({ $or: [{ email: parsed.data.email }, { mobile: parsed.data.mobile }] });
  if (existing) {
    res.status(409).json({ error: { code: "ACCOUNT_EXISTS", message: "Email or mobile is already registered" } });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await User.create({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    mobile: parsed.data.mobile,
    passwordHash
  });
  res.status(201).json({
    data: {
      accessToken: signToken(user),
      user: { id: String(user._id), fullName: user.fullName, email: user.email, mobile: user.mobile, roles: user.roles }
    }
  });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    return;
  }
  const identifier = parsed.data.identifier.toLowerCase();
  const user = await User.findOne({ $or: [{ email: identifier }, { mobile: parsed.data.identifier }] }).select("+passwordHash");
  if (!user || !(await user.verifyPassword(parsed.data.password)) || user.status !== "active") {
    res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email/mobile or password" } });
    return;
  }
  res.json({
    data: {
      accessToken: signToken(user),
      user: { id: String(user._id), fullName: user.fullName, email: user.email, mobile: user.mobile, roles: user.roles }
    }
  });
});

authRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await User.findById(req.auth?.userId);
  if (!user) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    return;
  }
  res.json({ data: { id: String(user._id), fullName: user.fullName, email: user.email, mobile: user.mobile, roles: user.roles } });
});
