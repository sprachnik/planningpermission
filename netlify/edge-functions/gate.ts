// Netlify Edge Function: simple password gate for the whole site.
// Runs on Netlify's free tier (unlike the paid built-in site-wide password
// protection). Checks a signed cookie on every request; unauthenticated
// requests are shown an inline login form which POSTs back to /login.

import type { Context } from "https://edge.netlify.com";

const COOKIE_NAME = "roofplan_auth";
const SESSION_HOURS = 24 * 14; // 2 weeks

function getSecret(): string {
  const secret = Deno.env.get("GATE_SECRET") ?? Deno.env.get("GATE_PASSWORD");
  if (!secret) throw new Error("GATE_PASSWORD (and optionally GATE_SECRET) must be set in Netlify env vars");
  return secret;
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeCookieValue(): Promise<string> {
  const expiry = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const sig = await sign(String(expiry));
  return `${expiry}.${sig}`;
}

async function isValidCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expiryStr, sig] = value.split(".");
  if (!expiryStr || !sig) return false;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = await sign(expiryStr);
  return expected === sig;
}

function loginPage(error?: string): string {
  // Mirrors the app's design system (src/index.css): light paper background,
  // hairline card, system font stack, #0071e3 accent.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Auto-Planning UK — Sign in</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
  :root { --paper: #f5f5f7; --surface: #fff; --ink: #1d1d1f; --ink-2: #6e6e73; --hairline: rgba(0,0,0,0.08); --accent: #0071e3; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, Inter, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 100vh; margin: 0; background: var(--paper); color: var(--ink);
  }
  .card {
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 20px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.07);
    padding: 2.5rem 2.25rem 2.25rem; width: min(360px, calc(100vw - 2rem)); text-align: center;
  }
  .mark { margin-bottom: 1rem; }
  h1 { font-size: 1.35rem; letter-spacing: -0.02em; margin: 0 0 0.25rem; font-weight: 650; }
  .sub { color: var(--ink-2); font-size: 0.9rem; margin: 0 0 1.5rem; }
  input {
    width: 100%; padding: 0.7rem 0.9rem; margin-bottom: 0.75rem; font-size: 1rem;
    border: 1px solid var(--hairline); border-radius: 12px; background: var(--paper); color: var(--ink); outline: none;
  }
  input:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px rgba(0,113,227,0.18); }
  button {
    width: 100%; padding: 0.7rem; border: none; border-radius: 980px; font-size: 1rem;
    background: var(--accent); color: #fff; font-weight: 550; cursor: pointer;
  }
  button:hover { background: #0077ed; }
  .error { color: #d70015; font-size: 0.85rem; margin: -0.25rem 0 0.75rem; }
  footer { margin-top: 1.75rem; font-size: 0.78rem; color: var(--ink-2); text-align: center; }
  footer a { color: var(--ink-2); }
</style></head>
<body>
  <form class="card" method="POST" action="/login">
    <div class="mark">
      <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#101418"/><path d="M14 40 L32 20 L50 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 44 H42" fill="none" stroke="#0a84ff" stroke-width="5" stroke-linecap="round"/></svg>
    </div>
    <h1>Auto-Planning UK</h1>
    <p class="sub">Sign in to continue</p>
    ${error ? `<div class="error">${error}</div>` : ""}
    <input type="password" name="password" placeholder="Password" autofocus required />
    <button type="submit">Sign in</button>
  </form>
  <footer>Private tool — not open source · Built by <a href="https://www.linkedin.com/in/jamesmoores/" target="_blank" rel="noreferrer">James Moores</a></footer>
</body></html>`;
}

// Crawler/agent discovery files stay public even while the site is gated.
const PUBLIC_PATHS = new Set(["/robots.txt", "/llms.txt", "/favicon.svg"]);

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);

  // Set GATE_PUBLIC=true in Netlify env to open the whole site (the in-app
  // stub login still gates the planning pages); the password gate then stands
  // down. Until then only the discovery files above are public.
  if (Deno.env.get("GATE_PUBLIC") === "true" || PUBLIC_PATHS.has(url.pathname)) {
    return context.next();
  }

  if (url.pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    const submitted = form.get("password");
    if (submitted !== Deno.env.get("GATE_PASSWORD")) {
      return new Response(loginPage("Incorrect password"), {
        status: 401,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const cookieValue = await makeCookieValue();
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": `${COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`,
      },
    });
  }

  if (url.pathname === "/login") {
    return new Response(loginPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const authed = await isValidCookie(match?.[1]);

  if (!authed) {
    return new Response(loginPage(), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return context.next();
};

export const config = { path: "/*" };
