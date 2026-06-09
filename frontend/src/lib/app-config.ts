/**
 * Application configuration.
 *
 * All values can be overridden via environment variables (VITE_ prefix) in a .env file
 * at the frontend/ root — no code changes required.
 *
 * Example .env file:
 *   VITE_SUPPORT_EMAIL=support@mycollege.edu
 */

/** Email address used in the "Contact Support" link throughout the app. */
export const SUPPORT_EMAIL: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPPORT_EMAIL) ||
  "support@collegevote.com";
