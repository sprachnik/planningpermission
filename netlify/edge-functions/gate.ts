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
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>roofplan — sign in</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f5f7; }
  form { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 280px; }
  h1 { font-size: 1.1rem; margin: 0 0 1rem; }
  input { width: 100%; padding: 0.6rem; margin-bottom: 0.75rem; border: 1px solid #dde0e2; border-radius: 8px; box-sizing: border-box; }
  button { width: 100%; padding: 0.6rem; border: none; border-radius: 8px; background: #4353ff; color: #fff; font-weight: 600; cursor: pointer; }
  .error { color: #c0392b; font-size: 0.85rem; margin: -0.5rem 0 0.75rem; }
</style></head>
<body>
  <form method="POST" action="/login">
    <h1>roofplan</h1>
    ${error ? `<div class="error">${error}</div>` : ""}
    <input type="password" name="password" placeholder="Password" autofocus required />
    <button type="submit">Enter</button>
  </form>
</body></html>`;
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);

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
