// Media library: validated uploads, sharp re-encode, and a tiny registry so the
// admin can reuse an image instead of re-uploading it on every page.

import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { db, insert, UPLOAD_DIR } from "./db.js";
import { id, nowIso, str } from "./util.js";

const MAX_BYTES = 8 * 1024 * 1024;
const RASTER = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const SVG = "image/svg+xml";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (!RASTER.has(file.mimetype) && file.mimetype !== SVG) {
      return cb(new Error("Upload a JPG, PNG, WebP, AVIF, GIF or SVG file."));
    }
    cb(null, true);
  }
});

export function mediaUrl(filename) {
  const f = String(filename || "").trim();
  if (!f) return "";
  // External URLs pass through untouched; stored filenames are served from /media.
  if (/^(https?:)?\/\//i.test(f)) return f;
  return `/media/${encodeURIComponent(f)}`;
}

// True when an image reference can actually be served: external URLs always,
// library filenames only while the row exists (deleted or renamed references
// fall back to the placeholder instead of a broken-image icon). Fields may
// hold either the media id (m_x) or its filename (m_x.webp).
export function mediaExists(filename) {
  const f = String(filename || "").trim();
  if (!f) return false;
  if (/^(https?:)?\/\//i.test(f) || f.startsWith("/")) return true;
  return !!db.prepare("SELECT 1 FROM media WHERE id = ? OR filename = ?").get(f, f);
}

export const mediaPath = (filename) => path.join(UPLOAD_DIR, path.basename(String(filename || "")));

export function getMedia(mediaId) {
  return db.prepare("SELECT * FROM media WHERE id = ?").get(String(mediaId || "")) || null;
}

export function listMedia(limit = 200) {
  return db.prepare("SELECT * FROM media ORDER BY created_at DESC LIMIT ?").all(limit);
}

function safeSvg(buffer) {
  const text = buffer.toString("utf8");
  if (!/<svg[\s>]/i.test(text)) throw new Error("That file is not a valid SVG.");
  // An SVG is executable in the browser. Uploads are same-origin, so strip the
  // constructs that can run script or load remote resources. Script can also
  // arrive through SMIL animation and external <use>/href references, so those
  // are banned outright, and every href must be a same-file fragment.
  if (/<\s*(script|foreignObject|iframe|object|embed|animate|animateTransform|animateMotion|set|handler)\b/i.test(text)) {
    throw new Error("SVG files with scripts or animation are not allowed.");
  }
  if (/\son\w+\s*=/i.test(text)) throw new Error("SVG files with event handlers are not allowed.");
  if (/javascript:|data:text\/html|vbscript:/i.test(text)) throw new Error("SVG links are not allowed.");
  // Every href — quoted or not — must be a same-file fragment ("#id").
  const quoted = /(?:^|\s)(?:xlink:href|href)\s*=\s*["']([^"']*)["']/gi;
  const unquoted = /(?:^|\s)(?:xlink:href|href)\s*=\s*([^"'\s>]+)/gi;
  for (const re of [quoted, unquoted]) {
    for (const match of text.matchAll(re)) {
      if (!match[1].startsWith("#")) throw new Error("SVG files may only link within themselves.");
    }
  }
  return text.replace(/<\?xml[^>]*\?>/i, "").trim();
}

/**
 * Store one uploaded buffer. Rasters are re-encoded (strips EXIF and any
 * polyglot payloads) and capped at 2400 px; SVGs are sanitised and stored as-is.
 */
export async function saveUpload(file, { alt = "" } = {}) {
  if (!file?.buffer?.length) throw new Error("Choose a file to upload.");
  if (file.size > MAX_BYTES) throw new Error("Images must be under 8 MB.");
  const mediaId = id("m_");
  let filename;
  let mime;
  let width = null;
  let height = null;

  if (file.mimetype === SVG) {
    const svg = safeSvg(file.buffer);
    filename = `${mediaId}.svg`;
    mime = SVG;
    fs.writeFileSync(mediaPath(filename), svg);
  } else {
    const pipeline = sharp(file.buffer, { failOn: "error" }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new Error("That image could not be read.");
    const out = await pipeline
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    filename = `${mediaId}.webp`;
    mime = "image/webp";
    width = out.info.width;
    height = out.info.height;
    fs.writeFileSync(mediaPath(filename), out.data);
  }

  const row = {
    id: mediaId,
    filename,
    original_name: str(file.originalname, 180),
    mime,
    size: file.size,
    width,
    height,
    alt: str(alt, 200),
    created_at: nowIso()
  };
  insert("media", row);
  return row;
}

export function updateMedia(mediaId, { alt }) {
  db.prepare("UPDATE media SET alt = ? WHERE id = ?").run(str(alt, 200), mediaId);
}

// Refuse to delete an image that a page, product, service or theme still points at.
export function mediaUsage(filename) {
  if (!filename) return [];
  const like = `%${filename}%`;
  const checks = [
    ["products", "SELECT COUNT(*) AS n FROM products WHERE image LIKE ? OR gallery LIKE ?", [like, like]],
    ["services", "SELECT COUNT(*) AS n FROM services WHERE image LIKE ?", [like]],
    ["pages", "SELECT COUNT(*) AS n FROM pages WHERE sections LIKE ? OR seo_image LIKE ?", [like, like]],
    ["theme", "SELECT COUNT(*) AS n FROM settings WHERE key = 'theme' AND value LIKE ?", [like]],
    ["testimonials", "SELECT COUNT(*) AS n FROM testimonials WHERE image LIKE ?", [like]]
  ];
  const used = [];
  for (const [label, sql, params] of checks) {
    if (db.prepare(sql).get(...params).n > 0) used.push(label);
  }
  return used;
}

export function deleteMedia(mediaId) {
  const row = getMedia(mediaId);
  if (!row) return { ok: false, error: "Image not found." };
  const used = mediaUsage(row.filename);
  if (used.length) return { ok: false, error: `Still used by ${used.join(", ")}. Remove those references first.` };
  try { fs.unlinkSync(mediaPath(row.filename)); } catch { /* already gone */ }
  db.prepare("DELETE FROM media WHERE id = ?").run(mediaId);
  return { ok: true };
}

export { UPLOAD_DIR, MAX_BYTES };
