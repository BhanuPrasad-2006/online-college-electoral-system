const BASE = "http://127.0.0.1:8000/api/v1";

// ── Storage helpers ──────────────────────────────────────────
const KEYS = {
  token:        "collegevote-token",
  role:         "collegevote-demo-auth",
  otpSession:   "collegevote-otp-session",
  otpEmail:     "collegevote-otp-email",
  otpMobile:    "collegevote-otp-mobile",
  userId:       "collegevote-user-id",
  fullName:     "collegevote-full-name",
  department:   "collegevote-department",
  semester:     "collegevote-semester",
};

export function saveAuth(token: string, role: string, userId: string, fullName: string, department?: string, semester?: string) {
  try {
    sessionStorage.setItem(KEYS.token,    token);
    sessionStorage.setItem(KEYS.role,     role);
    sessionStorage.setItem(KEYS.userId,   userId);
    sessionStorage.setItem(KEYS.fullName, fullName);
    if (department) sessionStorage.setItem(KEYS.department, department);
    if (semester) sessionStorage.setItem(KEYS.semester, semester);
  } catch { /* ignore */ }
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
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
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.detail ?? "Request failed");
    if (data.remarks) (err as any).remarks = data.remarks;
    throw err;
  }
  return data as T;
}

async function put<T>(path: string, body: object): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
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
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/voter/login",
    { email, password }
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
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/candidate/login",
    { email, mobile_number, password }
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
  return post<{ otp_session_token: string; hint: string; message: string }>(
    "/auth/admin/login",
    { email, mobile_number, password }
  );
}

export async function adminLoginStep2(sessionToken: string, email_otp: string, sms_otp: string) {
  return post<{ access_token: string; role: string; user_id: string; full_name: string; expires_in_seconds: number }>(
    "/auth/admin/verify-otp",
    { otp_session_token: sessionToken, email_otp, sms_otp }
  );
}

// ── Vote Casting ──────────────────────────────────────────────
export async function castVote(candidateId: string | null) {
  const token = getAuthToken();
  const res = await fetch(`${BASE}/vote/cast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ candidate_id: candidateId }),
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
  return post<{ otp_session_token: string; hint: string }>(
    "/auth/forgot-password/request",
    { email }
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
export async function checkCandidateEligibility(email: string, password: string) {
  return post<{ otp_session_token: string; message: string }>("/candidates/eligibility-check", { email, password });
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
  }
) {
  return post<{ message: string; candidate_id: string; status: string }>("/candidates/register", {
    otp_session_token: sessionToken,
    ...details,
  });
}

