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
  if (!res.ok) throw new Error(data.detail ?? "Request failed");
  return data as T;
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
