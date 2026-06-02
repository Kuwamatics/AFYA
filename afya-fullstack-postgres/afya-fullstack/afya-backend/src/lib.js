// lib.js — small shared helpers mirrored from the prototype so business rules live in one place.
import crypto from "crypto";

export const uid = (p = "id") => p + "_" + crypto.randomBytes(8).toString("hex");
export const j = (v, fallback) => { try { return JSON.parse(v); } catch { return fallback; } };

// Declining platform take: 1st visit with a provider = 20%, 2nd–3rd = 15%, 4th+ = 10%.
export const takeRateForCount = (n) => (n <= 0 ? 0.20 : n <= 2 ? 0.15 : 0.10);

// Anti-circumvention: strip phone numbers, emails and off-platform solicitation from messages.
// Returns { clean, blocked }. Never alters clinical wording — only contact details.
export function scrubContact(text) {
  const patterns = [
    /(\+?254|\b0)\s?7\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g,
    /\b\d[\d\s().-]{6,}\d\b/g,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    /\b(whats\s?app|telegram|signal|instagram|facebook|tiktok|snapchat)\b/gi,
    /\b(call|text|dm|whatsapp|reach|contact|ping|email)\s+me\b/gi,
  ];
  let out = text, blocked = false;
  for (const re of patterns) { if (out.match(re)) { blocked = true; out = out.replace(re, "•••"); } }
  return { clean: out, blocked };
}

// Public listings show first name + last initial; full name appears post-booking.
export const maskedName = (name) => {
  if (!name) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  parts[parts.length - 1] = parts[parts.length - 1][0].toUpperCase() + ".";
  return parts.join(" ");
};
