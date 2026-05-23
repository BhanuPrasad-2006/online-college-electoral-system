/**
 * Device fingerprinting utility.
 *
 * Generates a deterministic hash from browser properties that remains
 * stable for the same device/browser profile. Sent as an HTTP header
 * to the backend for token-to-device binding.
 */

/** Collect browser signals and return a SHA-256 fingerprint string. */
export async function getDeviceFingerprint(): Promise<string> {
  const signals: Record<string, string> = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages?.join(",") ?? "",
    platform: (navigator as any).platform ?? "",
    hardwareConcurrency: String(navigator.hardwareConcurrency ?? ""),
    deviceMemory: String((navigator as any).deviceMemory ?? ""),
    screenWidth: String(screen.width),
    screenHeight: String(screen.height),
    screenColorDepth: String(screen.colorDepth),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: String(new Date().getTimezoneOffset()),
    touchSupport: "ontouchstart" in window ? "1" : "0",
  };

  // Canvas fingerprint (subtle variation across GPUs/drivers)
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("OCES", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("fp", 4, 45);
    signals.canvasFingerprint = canvas.toDataURL();
  } catch { /* canvas unavailable */ }

  // WebGL fingerprint
  try {
    const canvas2 = document.createElement("canvas");
    const gl = canvas2.getContext("webgl") || (canvas2.getContext("experimental-webgl") as any);
    if (gl) {
      signals.webglVendor = gl.getParameter(gl.VENDOR) ?? "";
      signals.webglRenderer = gl.getParameter(gl.RENDERER) ?? "";
    }
  } catch { /* webgl unavailable */ }

  // Hash all signals into one fingerprint string
  const raw = Object.entries(signals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const hash = await sha256(raw);
  return hash;
}


/** Compute SHA-256 digest of a string and return hex. */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  // Convert ArrayBuffer to hex string
  const hexBytes = Array.from(new Uint8Array(hashBuffer));
  return hexBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
