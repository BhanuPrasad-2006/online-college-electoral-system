const CLIENT_HOST =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";
const API_HOST = CLIENT_HOST === "localhost" || CLIENT_HOST === "::1" ? "localhost" : CLIENT_HOST;
// Use HTTPS in production (when host is not localhost), HTTP for local dev
const PROTOCOL =
  typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http";
const DEFAULT_API_BASE = "http://127.0.0.1:8000/api/v1";
const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";

const computedBase = `${PROTOCOL}://${API_HOST}:8000/api/v1`;
const computedOrigin = `${PROTOCOL}://${API_HOST}:8000`;
const envApiBase = typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL;
const envApiOrigin = typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_ORIGIN;

export const API_BASE_URL = typeof envApiBase === "string" && envApiBase.trim()
  ? envApiBase.trim()
  : computedBase || DEFAULT_API_BASE;
export const API_ORIGIN = typeof envApiOrigin === "string" && envApiOrigin.trim()
  ? envApiOrigin.trim()
  : computedOrigin || DEFAULT_API_ORIGIN;
const RETRY_DELAY_MS = 150;
const REQUEST_TIMEOUT_MS = 60_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));  async function ensureDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const existing = sessionStorage.getItem("collegevote-fingerprint");
    if (existing) return existing;
    const mod = await import("./device-fingerprint");
    const fp = await mod.getDeviceFingerprint();
    sessionStorage.setItem("collegevote-fingerprint", fp);
    return fp;
  } catch {
    return "";
  }
}

function normalizeFetchError(error: unknown) {
  if (error instanceof TypeError) {
    return new Error(
      `Request to ${API_BASE_URL} did not complete. The backend may be down, restarting, or crashing during the request.`,
    );
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error(
      `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The backend may be down or taking too long to respond. Please try again.`,
    );
  }
  return error instanceof Error ? error : new Error("Request failed");
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(input: string, init: RequestInit) {
  try {
    return await fetchWithTimeout(input, init);
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof DOMException)) {
      throw normalizeFetchError(error);
    }
    if ((init.method ?? "GET").toUpperCase() !== "GET") {
      throw normalizeFetchError(error);
    }
    await delay(RETRY_DELAY_MS);
    try {
      return await fetchWithTimeout(input, init);
    } catch (retryError) {
      throw normalizeFetchError(retryError);
    }
  }
}

// ── Storage helpers ──────────────────────────────────────────
const KEYS = {
  token: "collegevote-token",
  csrf: "collegevote-csrf-token",
  role: "collegevote-demo-auth",
  otpSession: "collegevote-otp-session",
  otpEmail: "collegevote-otp-email",
  otpMobile: "collegevote-otp-mobile",
  userId: "collegevote-user-id",
  fullName: "collegevote-full-name",
  department: "collegevote-department",
  semester: "collegevote-semester",
};

export function saveAuth(
  token: string,
  role: string,
  userId: string,
  fullName: string,
  department?: string,
  semester?: string,
  csrfToken?: string,
) {
  try {
    sessionStorage.setItem(KEYS.token, token);
    if (csrfToken) {
      sessionStorage.setItem(KEYS.csrf, csrfToken);
    }
    sessionStorage.setItem(KEYS.role, role);
    sessionStorage.setItem(KEYS.userId, userId);
    sessionStorage.setItem(KEYS.fullName, fullName);
    if (department) sessionStorage.setItem(KEYS.department, department);
    if (semester) sessionStorage.setItem(KEYS.semester, semester);
  } catch {
    /* ignore */
  }
}

export function getCsrfToken() {
  try {
    return sessionStorage.getItem(KEYS.csrf) ?? "";
  } catch {
    return "";
  }
}

export function saveOtpSession(sessionToken: string, email: string, mobile?: string) {
  try {
    sessionStorage.setItem(KEYS.otpSession, sessionToken);
    sessionStorage.setItem(KEYS.otpEmail, email);
    if (mobile) sessionStorage.setItem(KEYS.otpMobile, mobile);
  } catch {
    /* ignore */
  }
}

export function getOtpSession() {
  try {
    return {
      sessionToken: sessionStorage.getItem(KEYS.otpSession) ?? "",
      email: sessionStorage.getItem(KEYS.otpEmail) ?? "",
      mobile: sessionStorage.getItem(KEYS.otpMobile) ?? "",
    };
  } catch {
    return { sessionToken: "", email: "", mobile: "" };
  }
}

export function getAuthToken() {
  try {
    return sessionStorage.getItem(KEYS.token) ?? "";
  } catch {
    return "";
  }
}

export function getVotingToken() {
  try {
    return sessionStorage.getItem("collegevote-voting-token");
  } catch {
    return null;
  }
}

export function saveVotingToken(token: string) {
  try {
    sessionStorage.setItem("collegevote-voting-token", token);
  } catch {
    /* ignore */
  }
}

export function getFullName() {
  try {
    return sessionStorage.getItem(KEYS.fullName) ?? "";
  } catch {
    return "";
  }
}

export function resolveApiAssetUrl(path?: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

// ── Generic fetch wrapper ────────────────────────────────────
async function post<T>(path: string, body: object): Promise<T> {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) {
    headers["X-Client-Signature"] = fp;
  }
  let res: Response;
  try {
    res = await fetchWithRetry(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        window.location.href = "/";
      }
    }
    const err = new Error(data.error ?? data.detail ?? "Request failed");
    if (data.remarks) (err as any).remarks = data.remarks;
    throw err;
  }
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const fp_get = sessionStorage.getItem("collegevote-fingerprint");
  if (fp_get) {
    headers["X-Client-Signature"] = fp_get;
  }
  let res: Response;
  try {
    res = await fetchWithRetry(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers,
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        window.location.href = "/";
      }
    }
    const err = new Error(data.error ?? data.detail ?? "Request failed");
    if (data.remarks) (err as any).remarks = data.remarks;
    throw err;
  }
  return data as T;
}

async function put<T>(path: string, body: object): Promise<T> {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) {
    headers["X-Client-Signature"] = fp;
  }
  let res: Response;
  try {
    res = await fetchWithRetry(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        window.location.href = "/";
      }
    }
    const err = new Error(data.error ?? data.detail ?? "Request failed");
    if (data.remarks) (err as any).remarks = data.remarks;
    throw err;
  }
  return data as T;
}

// ── Candidate Management ──────────────────────────────────────
export async function fetchCandidates() {
  return get<any[]>("/candidates/");
}

export async function fetchDeptTurnout() {
  return get<any[]>("/election/stats/departments");
}

export async function fetchHourlyVotes() {
  return get<any[]>("/election/stats/hourly");
}

export async function fetchKpi() {
  return get<any>("/election/kpi");
}

export async function fetchNotifications() {
  return get<any[]>("/election/notifications");
}

export async function updateCandidateStatus(
  candidateId: string,
  status: string,
  adminRemarks?: string,
) {
  return put<{ message: string; candidate_id: string; status: string }>(
    `/candidates/${candidateId}/status`,
    { status, admin_remarks: adminRemarks },
  );
}

export async function fetchCandidateProfile() {
  return get<any>("/candidates/me");
}

export async function fetchConcernCategories() {
  return get<any[]>("/ai/concern-categories");
}

export async function saveManifesto(manifesto: string, submit = false, imageUrl?: string | null) {
  const body: Record<string, any> = { manifesto, submit, image_url: imageUrl ?? null };
  return put<{ message: string; manifesto_status: string }>("/candidates/me/manifesto", body);
}

export async function fetchManifestosForAdmin(statusFilter?: string) {
  const q = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return get<any[]>(`/candidates/admin/manifestos${q}`);
}

export async function reviewManifesto(
  manifestoId: string,
  status: "approved" | "rejected",
  adminRemarks?: string,
) {
  return put<{ message: string }>(`/candidates/admin/manifestos/${manifestoId}/review`, {
    status,
    admin_remarks: adminRemarks,
  });
}

// ── Voter Login ──────────────────────────────────────────────
export async function voterLoginStep1(email: string, password: string, captchaToken: string) {
  await ensureDeviceFingerprint();
  const cleanEmail = email.trim().toLowerCase();
  return post<{ otp_session_token: string; hint: string; message: string }>("/auth/voter/login", {
    email: cleanEmail,
    password,
    captcha_token: captchaToken,
  });
}

export async function voterLoginStep2(sessionToken: string, otp: string) {
  await ensureDeviceFingerprint();
  return post<{
    access_token: string;
    role: string;
    user_id: string;
    full_name: string;
    expires_in_seconds: number;
    csrf_token?: string;
  }>("/auth/voter/verify-otp", { otp_session_token: sessionToken, otp });
}

// ── Candidate Login ──────────────────────────────────────────
export async function candidateLoginStep1(email: string, mobile_number: string, password: string, captchaToken: string) {
  await ensureDeviceFingerprint();
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = mobile_number.replace(/\s/g, "").replace(/\+91/g, "").replace(/-/g, "");
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/candidate/login",
    { email: cleanEmail, mobile_number: cleanMobile, password, captcha_token: captchaToken },
  );
}

export async function candidateLoginStep2(
  sessionToken: string,
  email_otp: string,
  sms_otp: string,
) {
  await ensureDeviceFingerprint();
  return post<{
    access_token: string;
    role: string;
    user_id: string;
    full_name: string;
    expires_in_seconds: number;
    is_registered?: boolean;
    department?: string;
    semester?: string;
    csrf_token?: string;
  }>("/auth/candidate/verify-otp", { otp_session_token: sessionToken, email_otp, sms_otp });
}

// ── Admin Login ──────────────────────────────────────────────
export async function adminLoginStep1(email: string, mobile_number: string, password: string, captchaToken: string) {
  await ensureDeviceFingerprint();
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = mobile_number.replace(/\s/g, "").replace(/\+91/g, "").replace(/-/g, "");
  return post<{ otp_session_token: string; hint: string; message: string }>("/auth/admin/login", {
    email: cleanEmail,
    mobile_number: cleanMobile,
    password,
    captcha_token: captchaToken,
  });
}

export async function adminLoginStep2(sessionToken: string, email_otp: string, sms_otp: string) {
  await ensureDeviceFingerprint();
  return post<{
    access_token: string;
    role: string;
    user_id: string;
    full_name: string;
    expires_in_seconds: number;
    csrf_token?: string;
  }>("/auth/admin/verify-otp", { otp_session_token: sessionToken, email_otp, sms_otp });
}

// ── Voter Photo Upload (self-service) ─────────────────────────
export async function uploadVoterOwnPhoto(file: File): Promise<{
  success: boolean;
  message: string;
  pending_image_url?: string;
}> {
  await ensureDeviceFingerprint();
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Client-Signature"] = fp;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/vote/upload-photo`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error("Failed to upload photo. The server returned an unexpected response.");
  }
  if (!res.ok) throw new Error(data.detail ?? "Failed to upload photo");
  return data;
}

// ── Vote Casting ──────────────────────────────────────────────

/** Get the best available token: voting token preferred, fallback to normal access token */
function getBestToken(): string {
  return getVotingToken() || getAuthToken();
}

// verifyVoterId: Pre-validates verification ID against the DB before candidate selection.
export async function verifyVoterId(verificationId: string) {
  const token = getBestToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Client-Signature"] = fp;
  const res = await fetch(`${API_BASE_URL}/vote/verify-id`, {
    method: "POST",
    headers,
    body: JSON.stringify({ verification_id: verificationId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to verify ID");
  return data as { success: boolean; anti_replay_token?: string; message?: string };
}

export async function verifyFace(params: {
  liveFaceImage: string;
  antiReplayToken: string;
}): Promise<{ success: boolean; face_session_token: string; expires_in_seconds: number; anti_replay_token: string }> {
  const token = getBestToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Client-Signature"] = fp;
  const res = await fetch(`${API_BASE_URL}/vote/verify-face`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      live_face_image: params.liveFaceImage,
      anti_replay_token: params.antiReplayToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Face verification failed");
  return data;
}

/**
 * Passive liveness face verification.
 * Sends 3–8 base64-encoded JPEG frames to the backend.
 * No active gestures required — backend performs passive liveness checks.
 */
export async function verifyFacePassive(params: {
  frames: string[];
  antiReplayToken: string;
}): Promise<{ success: boolean; face_session_token: string; expires_in_seconds: number; anti_replay_token: string; match_score?: number; frames_matched?: number; frames_total?: number }> {
  const token = getBestToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Client-Signature"] = fp;
  const res = await fetch(`${API_BASE_URL}/vote/verify-face-passive`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      frames: params.frames,
      anti_replay_token: params.antiReplayToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = data.detail;
    let errMsg = "Face verification failed";
    let score: number | undefined = undefined;
    if (detail) {
      if (typeof detail === "string") {
        errMsg = detail;
      } else if (typeof detail === "object") {
        errMsg = detail.message ?? "Face verification failed";
        if (typeof detail.match_score === "number") {
          score = detail.match_score;
        }
      }
    }
    const err = new Error(errMsg) as any;
    if (score !== undefined) {
      err.match_score = score;
    }
    throw err;
  }
  return data;
}

export async function castVote(params: {
  candidateId: string | null;
  verificationId: string;
  liveFaceImage?: string | null;
  faceSessionToken?: string | null;
  antiReplayToken?: string;
  trapData?: {
    verification_field_confirm?: string;
    hidden_field_name?: string;
    phone_confirm?: string;
    submit_time_ms?: number;
  };
}) {
  const token = getBestToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Client-Signature"] = fp;
  const res = await fetch(`${API_BASE_URL}/vote/cast`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      candidate_id: params.candidateId,
      verification_id: params.verificationId,
      live_face_image: params.liveFaceImage ?? null,
      face_session_token: params.faceSessionToken ?? null,
      anti_replay_token: params.antiReplayToken,
      verification_field_confirm: params.trapData?.verification_field_confirm ?? "",
      hidden_field_name: params.trapData?.hidden_field_name ?? "",
      phone_confirm: params.trapData?.phone_confirm ?? "",
      submit_time_ms: params.trapData?.submit_time_ms ?? null,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to cast vote");
  return data;
}

// ── Change Password ──────────────────────────────────────────
export async function requestPasswordChange(currentPassword: string, newPassword: string) {
  return post<{ otp_session_token: string; hint: string }>("/auth/change-password/request", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function confirmPasswordChange(sessionToken: string, otp: string) {
  return post<{ message: string }>("/auth/change-password/confirm", {
    otp_session_token: sessionToken,
    otp,
  });
}

// ── Forgot Password ──────────────────────────────────────────
export async function requestForgotPassword(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  return post<{ otp_session_token: string; hint: string }>("/auth/forgot-password/request", {
    email: cleanEmail,
  });
}

export async function confirmForgotPassword(
  sessionToken: string,
  otp: string,
  newPassword: string,
) {
  return post<{ message: string }>("/auth/forgot-password/confirm", {
    otp_session_token: sessionToken,
    otp,
    new_password: newPassword,
  });
}

// ── Resend OTP ───────────────────────────────────────────────
export async function resendVoterOtp(sessionToken: string) {
  return post<{ otp_session_token: string; hint: string }>("/auth/voter/resend-otp", {
    otp_session_token: sessionToken,
  });
}

export async function resendCandidateOtp(sessionToken: string) {
  return post<{ otp_session_token: string; hint: string }>("/auth/candidate/resend-otp", {
    otp_session_token: sessionToken,
  });
}

export async function resendCandidateEmailOtp(sessionToken: string) {
  return post<{ otp_session_token: string; hint: string; message?: string }>(
    "/auth/candidate/resend-email-otp",
    { otp_session_token: sessionToken },
  );
}

export async function resendCandidateSmsOtp(sessionToken: string) {
  return post<{ otp_session_token: string; hint: string; message?: string }>(
    "/auth/candidate/resend-sms-otp",
    { otp_session_token: sessionToken },
  );
}

// ── Live Candidate Eligibility & Application ──────────────────
export async function candidateCheckStatus(email: string, mobile_number: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = mobile_number.replace(/\s/g, "").replace(/\+91/g, "").replace(/-/g, "");
  return post<{
    status: "exists" | "eligible" | "need_year" | "ineligible";
    token?: string;
    reason?: string;
    voter_details?: {
      full_name: string;
      department: string;
      semester: string;
    };
  }>("/auth/candidate/check", { email: cleanEmail, mobile_number: cleanMobile });
}

export async function candidateInitiateNew(
  email: string,
  mobile_number: string,
  year_of_study: number,
) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = mobile_number.replace(/\s/g, "").replace(/\+91/g, "").replace(/-/g, "");
  return post<{
    status: "eligible" | "ineligible";
    token?: string;
    reason?: string;
  }>("/auth/candidate/initiate", { email: cleanEmail, mobile_number: cleanMobile, year_of_study });
}

export async function checkCandidateEligibility(email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  return post<{ otp_session_token: string; message: string }>("/candidates/eligibility-check", {
    email: cleanEmail,
    password,
  });
}

export async function verifyEligibilityOtp(sessionToken: string, otp: string) {
  return post<{
    verified: boolean;
    full_name: string;
    department: string;
    semester: string;
    student_id?: string;
    mobile_number: string;
  }>("/candidates/verify-eligibility-otp", { otp_session_token: sessionToken, otp });
}

export async function fetchPositions() {
  return get<any[]>("/candidates/positions");
}

export async function registerCandidate(
  sessionToken: string,
  details: {
    position_id: string;
    party_name?: string;
    party_symbol_url?: string;
    manifesto?: string;
    payment_screenshot_url?: string;
    mobile_number: string;
    new_password?: string;
    full_name?: string;
    department?: string;
    student_id?: string;

  },
) {
  return post<{ message: string; candidate_id: string; status: string }>("/candidates/register", {
    otp_session_token: sessionToken,
    ...details,
  });
}

// ── Admin Voter Permission Control ─────────────────────────────
export async function fetchVotersForAdmin() {
  return get<any[]>("/vote/admin/voters");
}

export async function updateVoterPermission(voterId: string, permission: boolean) {
  return put<{ message: string; voter_id: string; vote_permission: boolean }>(
    `/vote/admin/voters/${voterId}/permission`,
    { vote_permission: permission },
  );
}

export async function setVoterVerificationCode(voterId: string, verificationId: string) {
  return put<{ message: string; voter_id: string; verification_id_set: boolean }>(
    `/vote/admin/voters/${voterId}/verification-code`,
    { verification_code: verificationId },
  );
}

// ── Bulk Permission Update ──────────────────────────────────────
export async function bulkUpdateVoterPermission(department: string, grant: boolean) {
  return post<{ message: string; affected_count: number; vote_permission: boolean; department: string }>(
    "/vote/admin/voters/bulk-permission",
    { vote_permission: grant, department },
  );
}

// ── Admin Election Control ──────────────────────────────────────
export async function fetchCurrentElection() {
  return get<any>("/election/current");
}

export async function getCurrentPhase() {
  return get<{
    phase: string;
    next_phase: string;
    remaining_time: string;
    is_paused: boolean;
    auto_transition: boolean;
  }>("/election/current-phase");
}

export async function announceElectionSchedule(electionId: string) {
  return post<{ message: string }>(`/election/${electionId}/announce`, {});
}

export async function pauseElection(electionId: string) {
  return post<{ message: string }>(`/election/${electionId}/pause`, {});
}

export async function resumeElection(electionId: string) {
  return post<{ message: string }>(`/election/${electionId}/resume`, {});
}

export async function emergencyStopElection(electionId: string) {
  return post<{ message: string }>(`/election/${electionId}/emergency-stop`, {});
}

export async function openVoting(electionId: string) {
  return post<any>(`/election/${electionId}/open-voting`, {});
}

export async function closeVoting(electionId: string) {
  return post<any>(`/election/${electionId}/close-voting`, {});
}

export async function publishResults(electionId: string) {
  return post<any>(`/election/${electionId}/publish-results`, {});
}

export async function updateElectionDates(
  electionId: string,
  details: {
    title: string;
    registration_start: string | null;
    registration_end: string | null;
    voting_start: string | null;
    voting_end: string | null;
  },
) {
  return put<{ message: string; election: any }>(`/election/${electionId}`, details);
}

export async function createElection(details: {
  title: string;
  registration_start: string | null;
  registration_end: string | null;
  voting_start: string | null;
  voting_end: string | null;
}) {
  return post<{ message: string; election: any }>("/election/", details);
}

// ── Security & Fraud Monitoring Endpoints (Phase 5) ─────────────
export async function fetchAiAlerts() {
  return get<any[]>("/admin/ai-alerts");
}

export async function resolveAiAlert(alertId: string) {
  return put<{ message: string; alert_id: string }>(`/admin/ai-alerts/${alertId}/resolve`, {});
}

export async function verifyLedger() {
  return get<any>("/admin/verify-ledger");
}

export interface AuditLogEntry {
  id: string;
  ts: string | null;
  ts_iso: string | null;
  event: string;
  actor: string;
  ip: string;
  desc: string | null;
  level: "success" | "warning" | "security";
}

export interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
  skip: number;
  limit: number;
}

export async function fetchAuditLogs(params?: {
  skip?: number;
  limit?: number;
  event_type?: string;
  actor?: string;
  ip?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
}): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params?.skip) qs.set("skip", String(params.skip));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.event_type) qs.set("event_type", params.event_type);
  if (params?.actor) qs.set("actor", params.actor);
  if (params?.ip) qs.set("ip", params.ip);
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  if (params?.q) qs.set("q", params.q);
  const queryStr = qs.toString();
  return get<AuditLogResponse>(`/admin/audit-logs${queryStr ? `?${queryStr}` : ""}`);
}

export async function fetchAuditLogDetail(logId: string) {
  return get<AuditLogEntry>(`/admin/audit-logs/${logId}`);
}

// ── Admin Pending Photo Review ────────────────────────────────
export async function fetchPendingPhotos() {
  return get<any[]>("/admin/pending-photos");
}

export async function approvePendingPhoto(voterId: string) {
  return post<{ success: boolean; message: string; current_image_url: string; previous_image_url: string }>(
    `/admin/pending-photos/${voterId}/approve`,
    {},
  );
}

export async function rejectPendingPhoto(voterId: string) {
  return post<{ success: boolean; message: string }>(
    `/admin/pending-photos/${voterId}/reject`,
    {},
  );
}

export async function requestPhotoReupload(voterId: string) {
  return post<{ success: boolean; message: string }>(
    `/admin/pending-photos/${voterId}/request-reupload`,
    {},
  );
}

export async function fetchReuploadRequests() {
  return get<any[]>("/admin/pending-photos/reupload-requests");
}

export async function clearReuploadRequest(voterId: string) {
  return post<{ success: boolean; message: string }>(
    `/admin/pending-photos/${voterId}/clear-reupload-request`,
    {},
  );
}

// ── Candidate Concerns Inbox (anonymized) ────────────────────
export async function fetchCandidateConcernsInbox(params?: { page?: number; page_size?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  const queryStr = qs.toString();
  return get<any>(`/concerns/candidate-inbox${queryStr ? `?${queryStr}` : ""}`);
}

// ── AI Admin Features (Features #3, #9) ────────────────────────
export async function fetchIpClusters() {
  return get<{
    clusters: { subnet: string; sessions: number; flagged: boolean }[];
    total_unique_ips: number;
  }>("/admin/ip-clusters");
}

export async function clusterConcerns() {
  return post<{ message: string; clustered: number; groups: number }>(
    "/admin/cluster-concerns",
    {},
  );
}

export async function fetchCampusReport() {
  return get<{
    generated_at: string;
    total_concerns: number;
    total_clusters: number;
    unclustered_count: number;
    category_distribution: Record<string, number>;
    sentiment_summary: { positive: number; neutral: number; negative: number };
    avg_priority: number;
    date_range: { earliest: string | null; latest: string | null };
    top_clusters: {
      cluster_id: string | null;
      is_unclustered: boolean;
      size: number;
      category: string;
      representative_texts: string[];
    }[];
    executive_summary: string;
    key_findings: string[];
    trend_analysis: string;
    suggested_actions: string[];
  }>("/admin/campus-report");
}

export async function fetchClusteredConcerns() {
  return get<{
    clusters: {
      cluster_id: string | null;
      is_unclustered: boolean;
      size: number;
      representative_texts: string[];
      category_distribution: Record<string, number>;
      sentiment_breakdown: { positive: number; neutral: number; negative: number };
      concerns: {
        concern_id: string;
        content: string;
        category: string;
        sentiment: string;
        priority: number;
        submitted_at: string | null;
      }[];
    }[];
    total_concerns: number;
    total_clusters: number;
    unclustered_count: number;
  }>("/admin/clustered-concerns");
}

export async function fetchCandidateConcernReport() {
  return get<{
    categories: any[];
    overall: { positive: number; neutral: number; negative: number };
  }>("/concerns/candidate-report");
}

// ── Announcements (Admin) ────────────────────────────────────
export async function fetchAnnouncements(limit = 20) {
  return get<any[]>(`/announcements/?limit=${limit}`);
}

// ── Manifesto AI Analysis ────────────────────────────────────
export async function analyzeAndStoreManifesto(content: string): Promise<any> {
  return post<any>("/candidates/me/manifesto/analyze", { content });
}

// ── Manifesto Media Upload ───────────────────────────────────
export async function uploadManifestoMedia(file: File): Promise<{ url: string }> {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(`${API_BASE_URL}/candidates/me/manifesto/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to upload manifesto file");
  return data;
}

// ── Concern Attachment Upload ─────────────────────────────────
export async function uploadConcernAttachment(file: File): Promise<{ url: string }> {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(`${API_BASE_URL}/concerns/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to upload attachment");
  return data;
}

export async function createAnnouncement(payload: {
  title: string;
  body: string;
  recipients: string;
}) {
  return post<any>("/announcements/", payload);
}

export async function deleteAnnouncement(announcementId: string) {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) {
    headers["X-Client-Signature"] = fp;
  }
  let res: Response;
  try {
    res = await fetchWithRetry(`${API_BASE_URL}/announcements/${announcementId}`, {
      method: "DELETE",
      headers,
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        window.location.href = "/";
      }
    }
    throw new Error(data.detail ?? "Request failed");
  }
  return data as any;
}

// ── Results (Admin) ──────────────────────────────────────────
export async function fetchElectionResults(electionId: string) {
  return get<any>(`/election/${electionId}/results`);
}

export async function fetchPublicResults() {
  return get<any>("/election/public-results");
}

// ── Campaign Media Endpoints ───────────────────────────────────
export async function fetchMediaItems() {
  return get<any[]>("/media");
}

export async function submitCampaignMedia(formData: FormData) {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const fpMedia = sessionStorage.getItem("collegevote-fingerprint");
  if (fpMedia) {
    headers["X-Client-Signature"] = fpMedia;
  }
  const res = await fetch(`${API_BASE_URL}/media`, {
    method: "POST",
    headers,
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to submit campaign media");
  return data;
}

export async function reviewCampaignMedia(
  mediaId: string,
  status: string,
  rejectionReason?: string,
) {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const form = new FormData();
  form.append("status_update", status);
  if (rejectionReason) {
    form.append("rejection_reason", rejectionReason);
  }
  const fpReview = sessionStorage.getItem("collegevote-fingerprint");
  if (fpReview) {
    headers["X-Client-Signature"] = fpReview;
  }
  const res = await fetch(`${API_BASE_URL}/media/${mediaId}/status`, {
    method: "PUT",
    headers,
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to review campaign media");
  return data;
}
export async function updateManifesto(content: string) {
  return put<{ message: string }>("/candidates/manifesto", { content });
}

async function del<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) {
    headers["X-Client-Signature"] = fp;
  }
  let res: Response;
  try {
    res = await fetchWithRetry(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers,
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        window.location.href = "/";
      }
    }
    const err = new Error(data.error ?? data.detail ?? "Request failed");
    if (data.remarks) (err as any).remarks = data.remarks;
    throw err;
  }
  return data as T;
}

// ── Admin Users Management (Super Admin) ─────────────────────
export async function fetchAdminUsers() {
  return get<any[]>("/admin/users");
}

export async function createAdminUser(data: { full_name: string; email: string; role: string; password?: string }) {
  return post<any>("/admin/users", data);
}

export async function deleteAdminUser(adminId: string) {
  return del<any>(`/admin/users/${adminId}`);
}

// ── Official Notices ──────────────────────────────────────────
export async function fetchNotices() {
  return get<any[]>("/admin/notices");
}

export async function createNotice(data: { title: string; priority: string; content: string; role_target: string }) {
  return post<any>("/admin/notices", data);
}

// ── Voting Token Endpoints ───────────────────────────────────
export async function requestVotingToken() {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Client-Signature"] = fp;
  const res = await fetch(`${API_BASE_URL}/auth/voting-token`, { method: "POST", headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.detail ?? "Failed to request voting token");
  return data as { voting_token: string; token_type: string; expires_in_seconds: number; election_id: string; csrf_token: string };
}

// ── Password Reconfirmation ────────────────────────────────────
export async function reconfirmPassword(currentPassword: string) {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Client-Signature"] = fp;
  const res = await fetch(`${API_BASE_URL}/auth/reconfirm-password`, {
    method: "POST",
    headers,
    body: JSON.stringify({ current_password: currentPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.detail ?? "Password reconfirmation failed");
  return data as { access_token: string; token_type: string; reconfirmed: boolean; reconfirmed_at: string; message: string };
}

// ── Admin Meetings ────────────────────────────────────────────
export async function fetchMeetings() {
  return get<any[]>("/admin/meetings");
}

export async function createMeeting(data: { title: string; agenda: string; meeting_time: string; participant_emails: string[] }) {
  return post<any>("/admin/meetings", data);
}

export async function attendMeeting(meetingId: string) {
  return post<any>(`/admin/meetings/${meetingId}/attend`, {});
}

// ── Party Management (Candidate Portal) ──────────────────────

export async function createParty(
  sessionToken: string,
  details: {
    party_name: string;
    party_symbol?: string;
    party_slogan?: string;
    party_manifesto: string;
    logo_url?: string;
    position_id: string;
    new_password?: string;
    full_name?: string;
    department?: string;
    student_id?: string;
  },
) {
  return post<{ message: string; party_id: string; candidate_id: string; status: string }>(
    "/parties/create",
    { otp_session_token: sessionToken, ...details },
  );
}

export async function fetchMyParty() {
  return get<any>("/parties/me");
}

export async function updatePartyManifesto(manifesto: string) {
  return put<{ message: string }>("/parties/me/manifesto", { manifesto });
}

export async function sendPartyInvitation(details: {
  invited_usn: string;
  invited_email: string;
  role: string;
  position?: string;
  message?: string;
}) {
  return post<{ message: string; invitation_id: string; expires_at: string }>(
    "/parties/me/invite",
    details,
  );
}

export async function cancelPartyInvitation(invitationId: string) {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Client-Signature"] = fp;
  const res = await fetchWithRetry(`${API_BASE_URL}/parties/me/invite/${invitationId}`, {
    method: "DELETE",
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.detail ?? "Failed to cancel invitation");
  return data;
}

export async function fetchPublicParty(partyId: string) {
  return get<any>(`/parties/public/${partyId}`);
}

// ── Admin Party Management ────────────────────────────────────

export async function fetchAdminParties(statusFilter?: string) {
  const q = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return get<any[]>(`/parties/admin/list${q}`);
}

export async function reviewPartyStatus(
  partyId: string,
  status: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  adminRemarks?: string,
) {
  return put<{ message: string; party_id: string; new_status: string }>(
    `/parties/admin/${partyId}/status`,
    { status, admin_remarks: adminRemarks },
  );
}

// ── Voter Party Invitations (Voter Dashboard) ─────────────────

export async function fetchMyPartyInvitations() {
  return get<any[]>("/voter/party-invitations");
}

export async function acceptPartyInvitation(invitationId: string) {
  return post<{ message: string; candidate_id: string; party_id: string; role: string }>(
    `/voter/party-invitations/${invitationId}/accept`,
    {},
  );
}

export async function rejectPartyInvitation(invitationId: string) {
  return post<{ message: string; invitation_id: string }>(
    `/voter/party-invitations/${invitationId}/reject`,
    {},
  );
}
