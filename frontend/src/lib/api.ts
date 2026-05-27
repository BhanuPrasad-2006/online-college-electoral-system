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
export const API_ORIGIN = `${PROTOCOL}://${API_HOST}:8000`;
const RETRY_DELAY_MS = 150;
const REQUEST_TIMEOUT_MS = 20_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizeFetchError(error: unknown) {
  if (error instanceof TypeError) {
    return new Error(
      `Request to ${BASE} did not complete. The backend may be down, restarting, or crashing during the request.`,
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

export async function fetchHourlyVotes() {
  return get<any[]>("/election/stats/hourly");
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
export async function voterLoginStep1(email: string, password: string, g_recaptcha_response: string) {
  const cleanEmail = email.trim().toLowerCase();
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/voter/login",
    { email: cleanEmail, password, g_recaptcha_response }
  );
}

export async function voterLoginStep2(sessionToken: string, otp: string) {
  return post<{ access_token: string; role: string; user_id: string; full_name: string; expires_in_seconds: number }>(
    "/auth/voter/verify-otp",
    { otp_session_token: sessionToken, otp }
  );
}

// ── Candidate Login ──────────────────────────────────────────
export async function candidateLoginStep1(email: string, mobile_number: string, password: string, g_recaptcha_response: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = mobile_number.replace(/\s/g, "").replace(/\+91/g, "").replace(/-/g, "");
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/candidate/login",
    { email: cleanEmail, mobile_number: cleanMobile, password, g_recaptcha_response }
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

export async function castVote(params: {
  candidateId: string | null;
  verificationId: string;
  liveFaceImage: string;
  antiReplayToken?: string;
  trapData?: {
    verification_field_confirm?: string;
    hidden_field_name?: string;
    phone_confirm?: string;
    submit_time_ms?: number;
  };
}) {
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
      candidate_id: params.candidateId,
      verification_id: params.verificationId,
      live_face_image: params.liveFaceImage,
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

// ── AI Admin Features (Features #3, #9) ────────────────────────
export async function fetchIpClusters() {
  return get<{ clusters: { subnet: string; sessions: number; flagged: boolean }[]; total_unique_ips: number }>("/admin/ip-clusters");
}

export async function clusterConcerns() {
  return post<{ message: string; clustered: number; groups: number }>("/admin/cluster-concerns", {});
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
  return get<{ categories: any[]; overall: { positive: number; neutral: number; negative: number } }>(
    "/concerns/candidate-report"
  );
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

  const res = await fetch(`${BASE}/candidates/me/manifesto/upload`, {
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

  const res = await fetch(`${BASE}/concerns/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Failed to upload attachment");
  return data;
}

export async function createAnnouncement(payload: { title: string; body: string; recipients: string }) {
  return post<any>("/announcements/", payload);
}

export async function deleteAnnouncement(announcementId: string) {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Accept": "application/json" };
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
    res = await fetchWithRetry(`${BASE}/announcements/${announcementId}`, {
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


