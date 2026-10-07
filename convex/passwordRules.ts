// Usernames, passwords and setup codes on a self-hosted copy (account.ts), shared with the sign-in screen and
// Settings, Account, so the browser and the server check the same rules. Pure: no server code.

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

// What's wrong with a new password, in the sign-in screen's words; null when it's fine.
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `At least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `At most ${MAX_PASSWORD} characters.`;
  return null;
}

// Usernames are kept as typed, lower case and trimmed, so "Sam" and "sam " sign in as sam.
export const normalUsername = (username: string) => username.trim().toLowerCase();

export function usernameProblem(username: string): string | null {
  const name = normalUsername(username);
  if (!name) return "Choose a username.";
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(name)) return "2 to 32 letters, digits, dots, dashes or underscores, starting with a letter or digit.";
  return null;
}

// Setup codes are 8 characters from Crockford's base 32 (no I, L, O or U), shown as two groups of four (7KQ4-M2XD).
// Typed in, case, spaces and dashes don't matter, and the letters people mistake for digits count as those digits.
export const SETUP_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const normalSetupCode = (code: string) =>
  code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

// Why a password sign-in was refused (ConvexError data from account.ts), so the screen can say it in the right place:
// newPasswordNeeded switches to Choose a new password; setupCode belongs under the setup code; the rest above the form.
export type PasswordRefusal = {
  kind: "password";
  reason: "wrongPassword" | "tooManyAttempts" | "newPasswordNeeded" | "setupCode" | "ownerExists" | "invalid" | "off";
  message: string;
};
