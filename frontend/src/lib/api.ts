const CLIENT_HOST =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";
const API_HOST =
  CLIENT_HOST === "localhost" || CLIENT_HOST === "::1"
    ? "localhost"
    : CLIENT_HOST;
// Use HTTPS in production (when host is not localhost), HTTP for local dev
const PROTOCOL = typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http";
const BASE = `${PROTOCOL}://${API_HOST}:8000/api/v1`;
export const API_BASE_URL = BASE;
const RETRY_DELAY_MS = 350;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizeFetchError(error: unknown) {
  if (error instanceof TypeError) {
    return new Error(
      `Request to ${BASE} did not complete. The backend may be down, restarting, or crashing during the request.`,
    );
  }
  return error instanceof Error ? error : new Error("Request failed");
}

async function fetchWithRetry(input: string, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw normalizeFetchError(error);
    }

    await delay(RETRY_DELAY_MS);

    try {
      return await fetch(input, init);
    } catch (retryError) {
      throw normalizeFetchError(retryError);
    }
  }
}

// ── Storage helpers ──────────────────────────────────────────
const KEYS = {
  token:        "collegevote-token",
  csrf:         "collegevote-csrf-token",
  role:         "collegevote-demo-auth",
  otpSession:   "collegevote-otp-session",
  otpEmail:     "collegevote-otp-email",
  otpMobile:    "collegevote-otp-mobile",
  userId:       "collegevote-user-id",
  fullName:     "collegevote-full-name",
  department:   "collegevote-department",
  semester:     "collegevote-semester",
};

export function saveAuth(token: string, role: string, userId: string, fullName: string, department?: string, semester?: string, csrfToken?: string) {
  try {
    sessionStorage.setItem(KEYS.token,    token);
    if (csrfToken) {
      sessionStorage.setItem(KEYS.csrf,   csrfToken);
    }
    sessionStorage.setItem(KEYS.role,     role);
    sessionStorage.setItem(KEYS.userId,   userId);
    sessionStorage.setItem(KEYS.fullName, fullName);
    if (department) sessionStorage.setItem(KEYS.department, department);
    if (semester) sessionStorage.setItem(KEYS.semester, semester);
  } catch { /* ignore */ }
}

export function getCsrfToken() {
  try { return sessionStorage.getItem(KEYS.csrf) ?? ""; } catch { return ""; }
}

export function saveOtpSession(sessionToken: string, email: string, mobile?: string) {
  try {
    sessionStorage.setItem(KEYS.otpSession, sessionToken);
    sessionStorage.setItem(KEYS.otpEmail,   email);
    if (mobile) sessionStorage.setItem(KEYS.otpMobile, mobile);
  } catch { /* ignore */ }
}

export function getOtpSession() {
  try {
    return {
      sessionToken: sessionStorage.getItem(KEYS.otpSession) ?? "",
      email:        sessionStorage.getItem(KEYS.otpEmail)   ?? "",
      mobile:       sessionStorage.getItem(KEYS.otpMobile)  ?? "",
    };
  } catch { return { sessionToken: "", email: "", mobile: "" }; }
}

export function getAuthToken() {
  try { return sessionStorage.getItem(KEYS.token) ?? ""; } catch { return ""; }
}

export function getFullName() {
  try { return sessionStorage.getItem(KEYS.fullName) ?? ""; } catch { return ""; }
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
    headers["X-Device-Fingerprint"] = fp;
  }
  let res: Response;
  try {
    res = await fetchWithRetry(`${BASE}${path}`, {
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
    const err = new Error(data.detail ?? "Request failed");
    if (data.remarks) (err as any).remarks = data.remarks;
    throw err;
  }
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const fp_get = sessionStorage.getItem("collegevote-fingerprint");
  if (fp_get) {
    headers["X-Device-Fingerprint"] = fp_get;
  }
  let res: Response;
  try {
    res = await fetchWithRetry(`${BASE}${path}`, {
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
    const err = new Error(data.detail ?? "Request failed");
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
    headers["X-Device-Fingerprint"] = fp;
  }
  let res: Response;
  try {
    res = await fetchWithRetry(`${BASE}${path}`, {
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
    const err = new Error(data.detail ?? "Request failed");
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

export async function fetchKpi() {
  return get<any>("/election/kpi");
}

export async function fetchNotifications() {
  return get<any[]>("/election/notifications");
}

export async function updateCandidateStatus(candidateId: string, status: string, adminRemarks?: string) {
  return put<{ message: string; candidate_id: string; status: string }>(
    `/candidates/${candidateId}/status`,
    { status, admin_remarks: adminRemarks }
  );
}

export async function fetchCandidateProfile() {
  return get<any>("/candidates/me");
}


// ── Voter Login ──────────────────────────────────────────────
export async function voterLoginStep1(email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/voter/login",
    { email: cleanEmail, password }
  );
}

export async function voterLoginStep2(sessionToken: string, otp: string) {
  return post<{ access_token: string; role: string; user_id: string; full_name: string; expires_in_seconds: number }>(
    "/auth/voter/verify-otp",
    { otp_session_token: sessionToken, otp }
  );
}

// ── Candidate Login ──────────────────────────────────────────
export async function candidateLoginStep1(email: string, mobile_number: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = mobile_number.replace(/\s/g, "").replace(/\+91/g, "").replace(/-/g, "");
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/candidate/login",
    { email: cleanEmail, mobile_number: cleanMobile, password }
  );
}

export async function candidateLoginStep2(sessionToken: string, email_otp: string, sms_otp: string) {
  return post<{ access_token: string; role: string; user_id: string; full_name: string; expires_in_seconds: number; is_registered?: boolean; department?: string; semester?: string; }>(
    "/auth/candidate/verify-otp",
    { otp_session_token: sessionToken, email_otp, sms_otp }
  );
}

// ── Admin Login ──────────────────────────────────────────────
export async function adminLoginStep1(email: string, mobile_number: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = mobile_number.replace(/\s/g, "").replace(/\+91/g, "").replace(/-/g, "");
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/admin/login",
    { email: cleanEmail, mobile_number: cleanMobile, password }
  );
}

export async function adminLoginStep2(sessionToken: string, email_otp: string, sms_otp: string) {
  return post<{ access_token: string; role: string; user_id: string; full_name: string; expires_in_seconds: number }>(
    "/auth/admin/verify-otp",
    { otp_session_token: sessionToken, email_otp, sms_otp }
  );
}

// ── Vote Casting ──────────────────────────────────────────────
// verifyVoterId: Pre-validates verification ID against the DB before candidate selection.
export async function verifyVoterId(verificationId: string) {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Device-Fingerprint"] = fp;
  const res = await fetch(`${BASE}/vote/verify-id`, {
    method: "POST",
    headers,
    body: JSON.stringify({ verification_id: verificationId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to verify ID");
  return data as { success: boolean; anti_replay_token?: string; message?: string };
}

export async function castVote(candidateId: string | null, verificationId: string, liveFaceImage: string, antiReplayToken?: string) {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const fp = sessionStorage.getItem("collegevote-fingerprint");
  if (fp) headers["X-Device-Fingerprint"] = fp;
  const res = await fetch(`${BASE}/vote/cast`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      candidate_id: candidateId,
      verification_id: verificationId,
      live_face_image: liveFaceImage,
      anti_replay_token: antiReplayToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to cast vote");
  return data;
}


// ── Change Password ──────────────────────────────────────────
export async function requestPasswordChange(currentPassword: string, newPassword: string) {
  return post<{ otp_session_token: string; hint: string }>(
    "/auth/change-password/request",
    { current_password: currentPassword, new_password: newPassword }
  );
}

export async function confirmPasswordChange(sessionToken: string, otp: string) {
  return post<{ message: string }>(
    "/auth/change-password/confirm",
    { otp_session_token: sessionToken, otp }
  );
}

// ── Forgot Password ──────────────────────────────────────────
export async function requestForgotPassword(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  return post<{ otp_session_token: string; hint: string }>(
    "/auth/forgot-password/request",
    { email: cleanEmail }
  );
}

export async function confirmForgotPassword(sessionToken: string, otp: string, newPassword: string) {
  return post<{ message: string }>(
    "/auth/forgot-password/confirm",
    { otp_session_token: sessionToken, otp, new_password: newPassword }
  );
}

// ── Resend OTP ───────────────────────────────────────────────
export async function resendVoterOtp(sessionToken: string) {
  return post<{ otp_session_token: string; hint: string }>(
    "/auth/voter/resend-otp",
    { otp_session_token: sessionToken }
  );
}

export async function resendCandidateOtp(sessionToken: string) {
  return post<{ otp_session_token: string; hint: string }>(
    "/auth/candidate/resend-otp",
    { otp_session_token: sessionToken }
  );
}

export async function resendCandidateEmailOtp(sessionToken: string) {
  return post<{ otp_session_token: string; hint: string; message?: string }>(
    "/auth/candidate/resend-email-otp",
    { otp_session_token: sessionToken }
  );
}

export async function resendCandidateSmsOtp(sessionToken: string) {
  return post<{ otp_session_token: string; hint: string; message?: string }>(
    "/auth/candidate/resend-sms-otp",
    { otp_session_token: sessionToken }
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

export async function candidateInitiateNew(email: string, mobile_number: string, year_of_study: number) {
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
  return post<{ otp_session_token: string; message: string }>("/candidates/eligibility-check", { email: cleanEmail, password });
}

export async function verifyEligibilityOtp(sessionToken: string, otp: string) {
  return post<{
    verified: boolean;
    full_name: string;
    department: string;
    semester: string;
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
    vice_president?: string;
    secretary?: string;
  }
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
    { vote_permission: permission }
  );
}

export async function setVoterVerificationCode(voterId: string, verificationId: string) {
  return put<{ message: string; voter_id: string; verification_id_set: boolean }>(
    `/vote/admin/voters/${voterId}/verification-code`,
    { verification_code: verificationId }
  );
}



// ── Admin Election Control ──────────────────────────────────────
export async function fetchCurrentElection() {
  return get<any>("/election/current");
}

export async function getCurrentPhase() {
  return get<{ phase: string; next_phase: string; remaining_time: string; is_paused: boolean; auto_transition: boolean }>("/election/current-phase");
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

export async function fetchAuditLogs() {
  return get<any[]>("/admin/audit-logs");
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
    headers["X-Device-Fingerprint"] = fpMedia;
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

export async function reviewCampaignMedia(mediaId: string, status: string, rejectionReason?: string) {
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
    headers["X-Device-Fingerprint"] = fpReview;
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


