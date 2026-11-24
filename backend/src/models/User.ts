import mongoose, { InferSchemaType, Model } from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  mobile: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  roles: { type: [String], enum: ["player", "captain", "owner", "organizer", "turfOwner", "districtAdmin", "stateAdmin", "nationalAdmin", "seller", "superAdmin"], default: ["player"] },
  emailVerified: { type: Boolean, default: false },
  mobileVerified: { type: Boolean, default: false },
  status: { type: String, enum: ["active", "disabled"], default: "active" }
}, { timestamps: true });

export type UserDocument = InferSchemaType<typeof userSchema>;
export type UserModel = Model<UserDocument & { verifyPassword(password: string): Promise<boolean> }>;

userSchema.methods.verifyPassword = function (password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

export const User: UserModel =
  mongoose.models.User as UserModel ||
  mongoose.model<UserDocument & { verifyPassword(password: string): Promise<boolean> }>("User", userSchema);
