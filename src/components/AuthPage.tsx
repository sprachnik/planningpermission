import { useState } from "react";
import { signIn, type StubUser } from "../auth";

/** Stubbed sign-in / sign-up. Any credentials work; the account lives in this
 *  browser's localStorage until real auth replaces src/auth.ts. */
export function AuthPage({ onSignedIn }: { onSignedIn: (user: StubUser) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address");
      return;
    }
    if (password.length < 4) {
      setError("Enter a password (4+ characters)");
      return;
    }
    onSignedIn(signIn(email.trim().toLowerCase()));
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === "signin" ? "Sign in" : "Create your account"}</h2>
        <p className="auth-sub">{mode === "signin" ? "Pick up your cases where you left off." : "Free while in preview — start drawing in minutes."}</p>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.co.uk" autoFocus autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </label>
        <button type="submit">{mode === "signin" ? "Sign in" : "Create account"}</button>
        <button
          type="button"
          className="secondary outline auth-demo"
          onClick={() => onSignedIn(signIn("demo@auto-planning.uk"))}
        >
          Continue with demo account
        </button>
        <p className="auth-switch">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setError(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </a>
        </p>
        <p className="auth-stub-note">Preview build: accounts are stored in this browser only.</p>
      </form>
    </div>
  );
}
