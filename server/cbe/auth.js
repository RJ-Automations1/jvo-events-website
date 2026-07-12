/**
 * CBE platform authentication + authorization.
 *
 * Phase I keeps this dependency-free: passwords are hashed with Node's built-in
 * scrypt, sessions are opaque bearer tokens held in memory, and users are seeded
 * from the CBE_USERS env var (or a dev default). Two roles gate access:
 *   - leadership: sees every program + the master dashboard
 *   - pm:         sees only the programs listed in their `programs` array
 *
 * CBE_USERS format (JSON array):
 *   [{ "email": "a@x.edu", "name": "Ada", "password": "secret",
 *      "role": "pm", "programs": ["lift-atl","scholars"] }]
 * A user may instead supply "passwordHash" ("salt:hash" from hashPassword()).
 */
import crypto from "node:crypto";
import { USER_ROLES, PROGRAM_IDS } from "./constants.js";

const SESSION_TTL_MS = Number(process.env.CBE_SESSION_TTL_MS) || 12 * 60 * 60 * 1000; // 12h

// token -> { email, expiresAt }
const sessions = new Map();

let users = null;

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeUser(u) {
  const role = u.role === USER_ROLES.LEADERSHIP ? USER_ROLES.LEADERSHIP : USER_ROLES.PM;
  const programs =
    role === USER_ROLES.LEADERSHIP
      ? [...PROGRAM_IDS]
      : (Array.isArray(u.programs) ? u.programs : []).filter((p) => PROGRAM_IDS.includes(p));
  return {
    email: String(u.email || "").toLowerCase().trim(),
    name: String(u.name || u.email || "").trim(),
    role,
    programs,
    passwordHash: u.passwordHash || (u.password ? hashPassword(u.password) : ""),
  };
}

function loadUsers() {
  if (users) return users;
  let raw = [];
  if (process.env.CBE_USERS) {
    try {
      raw = JSON.parse(process.env.CBE_USERS);
    } catch {
      console.warn("[cbe-auth] CBE_USERS is not valid JSON; ignoring.");
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    // Default login so the platform is usable out of the box. Tiera (Program
    // Coordinator) gets leadership access to every program. Override the
    // password with CBE_DEV_PASSWORD, or replace the whole roster with
    // CBE_USERS. Logged loudly so a real deployment sets a proper secret.
    console.warn(
      "[cbe-auth] No CBE_USERS configured — using the built-in default login " +
        "(tieraholmes@spelman.edu). Set CBE_DEV_PASSWORD or CBE_USERS to change it."
    );
    raw = [
      {
        email: "tieraholmes@spelman.edu",
        name: "Tiera Holmes",
        password: process.env.CBE_DEV_PASSWORD || "cbe2026",
        role: "leadership",
      },
    ];
  }
  users = raw.map(normalizeUser).filter((u) => u.email && u.passwordHash);
  return users;
}

export function authenticate(email, password) {
  const list = loadUsers();
  const user = list.find((u) => u.email === String(email || "").toLowerCase().trim());
  if (!user || !verifyPassword(password, user.passwordHash)) return null;

  const token = crypto.randomBytes(24).toString("base64url");
  sessions.set(token, { email: user.email, expiresAt: Date.now() + SESSION_TTL_MS });
  return { token, user: publicUser(user) };
}

export function publicUser(user) {
  return { email: user.email, name: user.name, role: user.role, programs: user.programs };
}

export function userForToken(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  const user = loadUsers().find((u) => u.email === s.email);
  return user ? publicUser(user) : null;
}

export function revokeToken(token) {
  sessions.delete(token);
}

export function isLeadership(user) {
  return user?.role === USER_ROLES.LEADERSHIP;
}

/** Can this user see / act on records for the given program id? */
export function canAccessProgram(user, program) {
  if (!user) return false;
  if (isLeadership(user)) return true;
  return user.programs.includes(program);
}

// --- Express middleware --------------------------------------------------

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.query.token;
  const user = userForToken(token);
  if (!user) return res.status(401).json({ error: "Not authenticated." });
  req.cbeUser = user;
  req.cbeToken = token;
  next();
}

export function requireLeadership(req, res, next) {
  if (!isLeadership(req.cbeUser)) {
    return res.status(403).json({ error: "Leadership access required." });
  }
  next();
}

/** Test/support hook. */
export function _resetUsers() {
  users = null;
  sessions.clear();
}
