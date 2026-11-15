// Content-hashed static asset URLs. Cloudflare and browsers cache aggressively;
// if CSS changes without a hash, nobody sees it.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, "../../public");
const hashes = new Map();

export function asset(file) {
  const name = String(file).replace(/^\//, "");
  if (!hashes.has(name)) {
    try {
      const buf = fs.readFileSync(path.join(PUBLIC_DIR, name));
      hashes.set(name, crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10));
    } catch {
      hashes.set(name, "dev");
    }
  }
  return `/${name}?v=${hashes.get(name)}`;
}

export const publicDir = PUBLIC_DIR;
