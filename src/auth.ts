/** Stubbed authentication. Accounts are per-browser localStorage only — any
 *  credentials "work". Swap for a real provider later; the app only touches
 *  this module's interface. */

export interface StubUser {
  email: string;
}

const KEY = "autoplanning_user";

export function getUser(): StubUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StubUser) : null;
  } catch {
    return null;
  }
}

export function signIn(email: string): StubUser {
  const user = { email };
  localStorage.setItem(KEY, JSON.stringify(user));
  return user;
}

export function signOut(): void {
  localStorage.removeItem(KEY);
}
