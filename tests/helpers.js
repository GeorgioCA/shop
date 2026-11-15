// Test harness: boots a real server on a temp data directory and drives it
// over HTTP with its own cookie jar. No mocks, no shared state.

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SECRET = "test-session-secret-0123456789";

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function startServer({ dataDir, port, env = {} } = {}) {
  const dir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), "shop-test-"));
  const p = port || (await freePort());
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(p),
      DATA_DIR: dir,
      SESSION_SECRET: SECRET,
      NODE_ENV: "test",
      PUBLIC_BASE_URL: `http://127.0.0.1:${p}`,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });

  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 15_000;
  let up = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}):\n${log}`);
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) { up = true; break; }
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error(`server did not start:\n${log}`);

  return {
    base,
    port: p,
    dataDir: dir,
    log: () => log,
    async stop({ keepData = false } = {}) {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await new Promise((r) => child.once("exit", r));
      }
      if (!keepData) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
    }
  };
}

export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  store(res) {
    const raw = res.headers.getSetCookie?.() || [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      if (idx < 0) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  csrf() {
    return this.cookies.get("shop_csrf") || "";
  }

  async request(pathname, { method = "GET", form = null, json = null, headers = {}, redirect = "manual" } = {}) {
    const h = { Accept: "text/html", ...headers };
    if (this.cookies.size) h.Cookie = this.cookieHeader();
    let body;
    if (form) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(form)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) for (const item of v) params.append(k, String(item));
        else params.append(k, String(v));
      }
      if (method !== "GET" && !params.has("_csrf") && this.csrf()) params.set("_csrf", this.csrf());
      body = params;
      h["Content-Type"] = "application/x-www-form-urlencoded";
    } else if (json) {
      body = JSON.stringify(json);
      h["Content-Type"] = "application/json";
      if (this.csrf()) h["X-CSRF-Token"] = this.csrf();
    }
    const res = await fetch(`${this.base}${pathname}`, { method, headers: h, body, redirect });
    this.store(res);
    return res;
  }

  get(pathname, opts = {}) {
    return this.request(pathname, { ...opts, method: "GET" });
  }

  post(pathname, form = {}, opts = {}) {
    return this.request(pathname, { ...opts, method: "POST", form });
  }

  async text(pathname, opts = {}) {
    const res = await this.get(pathname, opts);
    return { status: res.status, html: await res.text(), headers: res.headers };
  }

  async json(pathname, payload, opts = {}) {
    const res = await this.request(pathname, { ...opts, method: "POST", json: payload });
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data };
  }
}

export async function setupInstance({ preset = "restaurant", env = {} } = {}) {
  const server = await startServer({ env });
  const client = new Client(server.base);
  await client.get("/setup");
  const created = await client.post("/setup", {
    business_name: "Test Business",
    name: "Test Owner",
    email: "owner@example.test",
    password: "test-password-123",
    password2: "test-password-123"
  });
  if (created.status !== 302) throw new Error(`setup failed: ${created.status}`);
  const dash = await client.get("/admin");
  if (dash.status !== 200) throw new Error(`admin login failed: ${dash.status}`);
  const presetRes = await client.post("/admin/setup/preset", { preset });
  if (presetRes.status !== 302) throw new Error(`preset failed: ${presetRes.status}`);
  return { server, client };
}

export async function login(base, email, password) {
  const c = new Client(base);
  await c.get("/admin/login");
  const res = await c.post("/admin/login", { email, password });
  return { client: c, res };
}

export const firstMatch = (html, re) => {
  const m = re.exec(html);
  return m ? m[1] : "";
};

export const occurrences = (html, needle) => html.split(needle).length - 1;
