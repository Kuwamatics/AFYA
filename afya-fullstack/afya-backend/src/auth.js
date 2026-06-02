// auth.js — real authentication: bcrypt password hashing + JWT sessions + role guards.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const EXPIRES = "7d";

export const hashPassword = (pw) => bcrypt.hashSync(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: EXPIRES });

// Attaches req.user if a valid Bearer token is present; otherwise leaves it undefined.
export function authenticate(req, _res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, SECRET); } catch { /* invalid/expired → treated as anonymous */ }
  }
  next();
}

// Require a logged-in user, optionally restricted to specific roles.
export const requireAuth = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  if (roles.length && !roles.includes(req.user.role))
    return res.status(403).json({ error: "Not allowed for your role" });
  next();
};
