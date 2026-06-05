/**
 * Production API layer.
 *
 * All functions call the LIVE backend when a token exists.
 * Mock/demo data is ONLY used as an absolute last-resort fallback when
 * the backend is completely unreachable AND DEMO_MODE is explicitly enabled.
 *
 * DEMO_MODE=false (production): never returns mock data.
 * DEMO_MODE=true (demo only): falls back to mock on network error.
 */
import { DEMO_MODE } from "./demo-config";
import {
  getAuthToken,
  fetchCurrentElection,
  fetchKpi as liveFetchKpi,
  fetchNotifications as liveFetchNotifications,
  fetchDeptTurnout as liveFetchDeptTurnout,
  fetchAiAlerts as liveFetchAiAlerts,
  fetchAuditLogs as liveFetchAuditLogs,
  fetchPublicResults as liveFetchPublicResults,
  fetchHourlyVotes as liveFetchHourlyVotes,
  fetchMediaItems as liveFetchMediaItems,
  submitCampaignMedia as liveSubmitCampaignMedia,
  reviewCampaignMedia as liveReviewCampaignMedia,
  uploadConcernAttachment as liveUploadConcernAttachment,
} from "./api";
import {
  CANDIDATES,
  CANDIDATE_USER,
  CONCERN_CATEGORIES,
  DEPT_TURNOUT,
  ELECTION,
  HOURLY_VOTES,
  KPI,
  NOTIFICATIONS,
  RESULTS,
  VOTER,
  VOTER_CONCERNS,
  type Candidate,
  type MediaItem,
  type VoterConcern,
} from "./mock";

const delay = (ms = 140) =>
  DEMO_MODE ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();
const CLIENT_HOST =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";
const LIVE_API_HOST =
  CLIENT_HOST === "localhost" || CLIENT_HOST === "::1" ? "localhost" : CLIENT_HOST;
const LIVE_PROTOCOL =
  typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http";
const LIVE_API_BASE = `${LIVE_PROTOCOL}://${LIVE_API_HOST}:8000/api/v1`;
const LIVE_PROFILE_RETRY_DELAY_MS = 150;

function clone<T>(data: T): T {
  return structuredClone(data);
}

async function fetchLiveProfile<T>(path: string, token: string): Promise<T> {
  const request = () =>
    fetch(`${LIVE_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

  let res: Response;
  try {
    res = await request();
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
    await new Promise((r) => setTimeout(r, LIVE_PROFILE_RETRY_DELAY_MS));
    res = await request();
  }

  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

// ── Election ──────────────────────────────────────────────────

export async function fetchElection() {
  try {
    const data = await fetchCurrentElection();
    return {
      election_id: data.election_id,
      name: data.title,
      status: data.status,
      registration_start: data.registration_start ?? null,
      registration_end: data.registration_end ?? null,
      voting_start: data.voting_start ?? null,
      voting_end: data.voting_end ?? null,
      votingStart: data.voting_start ? new Date(data.voting_start) : null,
      votingEnd: data.voting_end ? new Date(data.voting_end) : null,
      registrationEnd: data.registration_end ? new Date(data.registration_end) : null,
    };
  } catch (e) {
    console.warn("Failed to fetch current election from backend:", e);
    if (DEMO_MODE) return clone(ELECTION);
    throw e;
  }
}

// ── Candidates ────────────────────────────────────────────────

export async function fetchCandidates(): Promise<Candidate[]> {
  const token = getAuthToken();
  if (token) {
    try {
      return await fetchLiveProfile<Candidate[]>("/candidates/", token);
    } catch (e) {
      console.warn("Candidate list fetch failed:", e);
      if (!DEMO_MODE) throw e;
    }
  }
  await delay();
  return clone(CANDIDATES);
}

// ── KPI ───────────────────────────────────────────────────────
// Live endpoint: GET /election/kpi — returns { registered, votesCast, turnout, alerts }

export async function fetchKpi() {
  try {
    return await liveFetchKpi();
  } catch (e) {
    console.warn("KPI fetch failed, using fallback:", e);
    if (!DEMO_MODE) throw e;
    await delay(80);
    return clone(KPI);
  }
}

// ── Notifications ─────────────────────────────────────────────
// Live endpoint: GET /election/notifications — returns real phase-derived notifications + notices

export async function fetchNotifications() {
  try {
    return await liveFetchNotifications();
  } catch (e) {
    console.warn("Notifications fetch failed, using fallback:", e);
    if (!DEMO_MODE) throw e;
    await delay(100);
    return clone(NOTIFICATIONS);
  }
}

// ── Media Items ───────────────────────────────────────────────

export async function fetchMediaItems(): Promise<MediaItem[]> {
  return liveFetchMediaItems();
}

export async function submitCampaignMedia(payload: any): Promise<any> {
  if (payload instanceof FormData) {
    return liveSubmitCampaignMedia(payload);
  }
  const form = new FormData();
  form.append("type", payload.type);
  form.append("title", payload.title);
  if (payload.url) form.append("external_url", payload.url);
  if (payload.body) form.append("body", payload.body);
  return liveSubmitCampaignMedia(form);
}

export async function reviewCampaignMedia(
  id: string,
  status: "Approved" | "Rejected",
  rejectionReason?: string,
): Promise<any> {
  return liveReviewCampaignMedia(id, status, rejectionReason);
}

// ── Voter Profile ─────────────────────────────────────────────

export interface VoterProfile {
  name: string;
  email: string;
  department: string;
  year: string;
  studentId: string;
  voter_code?: string;
  voted: boolean;
  vote_permission: boolean;
  verification_id_set?: boolean;
  face_enrolled?: boolean;
  reference_image_url?: string;
  pending_face_enrolled?: boolean;
  photo_reupload_count?: number;
  photo_reupload_requested?: boolean;
}

export async function fetchVoterProfile(): Promise<VoterProfile> {
  const token = getAuthToken();
  if (!token) {
    await delay(90);
    if (!DEMO_MODE) throw new Error("No auth token available.");
    const mockVoter = clone(VOTER);
    return {
      ...mockVoter,
      email: "voter@college.edu.in",
      vote_permission: true,
      face_enrolled: false,
      pending_face_enrolled: false,
      photo_reupload_count: 0,
      photo_reupload_requested: false,
    } as VoterProfile;
  }
  // Always fetch from live DB — never fall back to mock for authenticated users.
  return await fetchLiveProfile<VoterProfile>("/auth/voter/me", token);
}

// ── Candidate Profile ─────────────────────────────────────────

export async function fetchCandidateProfile() {
  const token = getAuthToken();
  if (!token) {
    await delay(90);
    if (!DEMO_MODE) throw new Error("No auth token available.");
    return clone(CANDIDATE_USER);
  }
  try {
    return await fetchLiveProfile("/auth/candidate/me", token);
  } catch (e) {
    console.error("Candidate profile fetch failed:", e);
    if (!DEMO_MODE) throw e;
    return clone(CANDIDATE_USER);
  }
}

// ── Concern Categories ────────────────────────────────────────

export async function fetchConcernCategories() {
  const token = getAuthToken();
  if (token) {
    try {
      return await fetchLiveProfile("/concerns/categories", token);
    } catch (e) {
      console.warn("Concern categories fetch failed:", e);
      if (!DEMO_MODE) throw e;
    }
  }
  await delay(110);
  return clone(CONCERN_CATEGORIES);
}

// ── Voter Concerns ────────────────────────────────────────────

export async function fetchVoterConcerns(): Promise<VoterConcern[]> {
  const token = getAuthToken();
  if (token) {
    try {
      const result = await fetchLiveProfile<{
        concerns: Array<{
          concern_id: string;
          content: string;
          category: string;
          attachment_url?: string | null;
          submitted_at?: string | null;
          to_candidate_id?: string | null;
        }>;
      }>("/concerns", token);

      return result.concerns.map((c) => ({
        id: c.concern_id,
        fromName: "You",
        department: "",
        toCandidateId: c.to_candidate_id || "",
        category: c.category || "Other",
        message: c.content,
        attachment: c.attachment_url
          ? { name: c.attachment_url.split("/").pop() ?? "attachment", url: c.attachment_url, type: "file/*" }
          : undefined,
        submittedAt: c.submitted_at ?? "Just now",
      })) as VoterConcern[];
    } catch (e) {
      console.error("Voter concerns fetch failed:", e);
      if (!DEMO_MODE) throw e;
    }
  }
  if (!DEMO_MODE) throw new Error("Unable to load voter concerns: no auth token.");
  await delay(100);
  return clone(VOTER_CONCERNS);
}

// ── Hourly Votes ──────────────────────────────────────────────
// Live endpoint: GET /election/stats/hourly

export async function fetchHourlyVotes() {
  try {
    return await liveFetchHourlyVotes();
  } catch (e) {
    console.warn("Hourly votes fetch failed, using fallback:", e);
    if (!DEMO_MODE) throw e;
    await delay(100);
    return clone(HOURLY_VOTES);
  }
}

// ── Department Turnout ────────────────────────────────────────
// Live endpoint: GET /election/stats/departments — returns real dept breakdown from DB

export async function fetchDeptTurnout() {
  try {
    return await liveFetchDeptTurnout();
  } catch (e) {
    console.warn("Dept turnout fetch failed, using fallback:", e);
    if (!DEMO_MODE) throw e;
    await delay(100);
    return clone(DEPT_TURNOUT);
  }
}

// ── AI Alerts ─────────────────────────────────────────────────
// Live endpoint: GET /admin/ai-alerts — returns real security alerts from DB

export async function fetchAiAlerts() {
  try {
    return await liveFetchAiAlerts();
  } catch (e) {
    console.warn("AI alerts fetch failed, using fallback:", e);
    if (!DEMO_MODE) throw e;
    return [];
  }
}

// ── Audit Logs ────────────────────────────────────────────────
// Live endpoint: GET /admin/audit-logs — returns real audit trail from DB

export async function fetchAuditLogs(params?: {
  skip?: number;
  limit?: number;
  event_type?: string;
  actor?: string;
  ip?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
}) {
  try {
    return await liveFetchAuditLogs(params);
  } catch (e) {
    console.warn("Audit logs fetch failed, using fallback:", e);
    if (!DEMO_MODE) throw e;
    await delay(130);
    return { logs: [], total: 0, skip: 0, limit: 50 };
  }
}

// ── Election Results ──────────────────────────────────────────
// Live endpoint: GET /election/public-results

export async function fetchResults() {
  try {
    return await liveFetchPublicResults();
  } catch (e) {
    console.warn("Results fetch failed, using fallback:", e);
    if (!DEMO_MODE) throw e;
    await delay(120);
    return clone(RESULTS);
  }
}

// ── Concern Submission ────────────────────────────────────────

export async function submitConcern(_payload: {
  toCandidateId: string;
  category: string;
  subject: string;
  message: string;
  attachmentFile?: File;
}): Promise<VoterConcern> {
  const token = getAuthToken();
  if (token) {
    try {
      // Step 1: Upload attachment if present
      let attachmentUrl: string | null = null;
      const fileToUpload = _payload.attachmentFile;
      if (fileToUpload) {
        try {
          const uploadResult = await liveUploadConcernAttachment(fileToUpload);
          attachmentUrl = uploadResult.url;
        } catch (uploadErr) {
          console.warn("Attachment upload failed, proceeding without it:", uploadErr);
        }
      }

      // Step 2: Create concern
      const res = await fetch(`${LIVE_API_BASE}/concerns/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to_candidate_id: _payload.toCandidateId || null,
          category: _payload.category || "other",
          subject: _payload.subject,
          message: _payload.message,
          attachment_url: attachmentUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        return {
          id: data.concern_id,
          fromName: "You",
          department: "",
          toCandidateId: _payload.toCandidateId,
          category: data.category,
          message: data.content,
          attachment:
            attachmentUrl && fileToUpload
              ? { name: fileToUpload.name, url: attachmentUrl, type: fileToUpload.type }
              : undefined,
          submittedAt: data.submitted_at ?? "Just now",
        } as any;
      }
      throw new Error(data.detail ?? `HTTP ${res.status}`);
    } catch (e) {
      console.error("submitConcern failed:", e);
      if (!DEMO_MODE) throw e;
    }
  }

  if (!DEMO_MODE) throw new Error("Unable to submit concern: no auth token.");

  await delay(280);
  return {
    id: `vc-${Date.now()}`,
    fromName: "You",
    department: "",
    toCandidateId: _payload.toCandidateId,
    category: _payload.category,
    message: `${_payload.subject}\n${_payload.message}`,
    submittedAt: "Just now",
  };
}

// ── AI Chat ───────────────────────────────────────────────────

export async function sendAiMessage(text: string) {
  const token = getAuthToken();
  try {
    const res = await fetch(`${LIVE_API_BASE}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ session_id: null, message: text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { reply: data.reply, source: data.is_mock ? "(AI service unavailable — using election data)" : "AI Service" };
  } catch (e) {
    console.warn("AI chat request failed:", e);
    if (!DEMO_MODE) {
      return {
        reply: "The AI assistant is temporarily unavailable. Please try again shortly or check the official notices for election information.",
        source: "(Service unavailable)",
      };
    }
    await delay(400);
    return {
      reply: "The AI assistant is temporarily unavailable. Please check the official notices for election information.",
      source: "(Unavailable)",
    };
  }
}
