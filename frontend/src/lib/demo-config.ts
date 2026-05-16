/** Demo mode: all data comes from local mocks until the backend is live. */
export const DEMO_MODE = true;

/** Reserved for production — not used while DEMO_MODE is true. */
export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";
