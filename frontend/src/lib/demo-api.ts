/**
 * Demo API layer — simulates network latency without calling a real backend.
 *
 * When the API is ready, replace each function body with the commented fetch pattern
 * and set DEMO_MODE to false in demo-config.ts.
 */
import { DEMO_MODE } from "./demo-config";
import {
  getAuthToken,
  fetchCurrentElection,
  fetchHourlyVotes as liveFetchHourlyVotes,
  fetchMediaItems as liveFetchMediaItems,
  submitCampaignMedia as liveSubmitCampaignMedia,
  reviewCampaignMedia as liveReviewCampaignMedia,
  uploadConcernAttachment as liveUploadConcernAttachment,
} from "./api";
import {
  AI_ALERTS,
  AUDIT_LOGS,
  CANDIDATES,
  CANDIDATE_USER,
  CONCERN_CATEGORIES,
  DEPT_TURNOUT,
  ELECTION,
  HOURLY_VOTES,
  KPI,
  MEDIA_ITEMS,
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
// Use HTTPS in production (when host is not localhost), HTTP for local dev
const LIVE_PROTOCOL =
  typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http";
const LIVE_API_BASE = `${LIVE_PROTOCOL}://${LIVE_API_HOST}:8000/api/v1`;
const LIVE_PROFILE_RETRY_DELAY_MS = 150;

function clone<T>(data: T): T {
  return structuredClone(data);
}

const demoMediaItems = clone(MEDIA_ITEMS);

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

    if (DEMO_MODE) {
      await delay(LIVE_PROFILE_RETRY_DELAY_MS);
    } else {
      await new Promise((r) => setTimeout(r, LIVE_PROFILE_RETRY_DELAY_MS));
    }
    res = await request();
  }

  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

// --- Live API stubs (disabled for Vercel demo) ---
// async function apiGet<T>(path: string): Promise<T> {
//   const res = await fetch(`${LIVE_API_BASE}${path}`, {
//     headers: { Accept: "application/json" },
//   });
//   if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
//   return res.json() as Promise<T>;
// }

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
    console.warn("Failed to fetch current election, using mock:", e);
    return clone(ELECTION);
  }
}

export async function fetchCandidates(): Promise<Candidate[]> {
  const token = getAuthToken();
  if (!DEMO_MODE && token) {
    try {
      return await fetchLiveProfile<Candidate[]>('/candidates', token);
    } catch (e) {
      console.warn('Candidate list fetch failed, falling back to mock:', e);
    }
  }

  await delay();
  return clone(CANDIDATES);
}

export async function fetchKpi() {
  // return apiGet<typeof KPI>("/election/kpi");
  await delay(80);
  return clone(KPI);
}

export async function fetchNotifications() {
  // return apiGet<typeof NOTIFICATIONS>("/notifications");
  await delay(100);
  return clone(NOTIFICATIONS);
}

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
    const mockVoter = clone(VOTER);
    return {
      ...mockVoter,
      email: "aditya.rao@college.edu.in",
      vote_permission: true,
      face_enrolled: false,
      pending_face_enrolled: false,
      photo_reupload_count: 0,
      photo_reupload_requested: false,
    } as VoterProfile;
  }

  // When a token exists, ALWAYS fetch from the database — never fall back to mock data.
  // Falling back to mock would show another student's name ("Aditya Rao") and hide real photo status.
  return await fetchLiveProfile<VoterProfile>("/auth/voter/me", token);
}

export async function fetchCandidateProfile() {
  const token = getAuthToken();
  if (!token) {
    await delay(90);
    return clone(CANDIDATE_USER);
  }

  try {
    return await fetchLiveProfile("/auth/candidate/me", token);
  } catch (e) {
    console.error("Candidate profile fetch failed, falling back to mock:", e);
    return clone(CANDIDATE_USER);
  }
}

export async function fetchConcernCategories() {
  const token = getAuthToken();
  if (!DEMO_MODE && token) {
    try {
      return await fetchLiveProfile('/concerns/categories', token);
    } catch (e) {
      console.warn('Concern categories fetch failed, falling back to mock:', e);
    }
  }
  await delay(110);
  return clone(CONCERN_CATEGORIES);
}

export async function fetchVoterConcerns(): Promise<VoterConcern[]> {
  const token = getAuthToken();
  if (!DEMO_MODE && token) {
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
      }>('/concerns', token);

      return result.concerns.map((c) => ({
        id: c.concern_id,
        fromName: VOTER.name,
        department: VOTER.department,
        toCandidateId: c.to_candidate_id || '',
        category: c.category || 'Other',
        message: c.content,
        attachment: c.attachment_url
          ? { name: c.attachment_url.split('/').pop() ?? 'attachment', url: c.attachment_url, type: 'file/*' }
          : undefined,
        submittedAt: c.submitted_at ?? 'Just now',
      })) as VoterConcern[];
    } catch (e) {
      console.error('Voter concerns fetch failed:', e);
      if (!DEMO_MODE) {
        throw e;
      }
      console.warn('Falling back to demo concerns because DEMO_MODE is enabled.');
    }
  }
  if (!DEMO_MODE) {
    throw new Error('Unable to load voter concerns from live backend.');
  }
  await delay(100);
  return clone(VOTER_CONCERNS);
}

export async function fetchHourlyVotes() {
  const token = getAuthToken();
  if (!DEMO_MODE && token) {
    try {
      return await liveFetchHourlyVotes();
    } catch (e) {
      console.warn("Hourly votes fetch failed, falling back to mock:", e);
    }
  }
  await delay(100);
  return clone(HOURLY_VOTES);
}

export async function fetchDeptTurnout() {
  // return apiGet<typeof DEPT_TURNOUT>("/election/stats/departments");
  await delay(100);
  return clone(DEPT_TURNOUT);
}

export async function fetchAiAlerts() {
  // return apiGet<typeof AI_ALERTS>("/admin/ai-alerts");
  await delay(100);
  return clone(AI_ALERTS);
}

export async function fetchAuditLogs() {
  // return apiGet<typeof AUDIT_LOGS>("/admin/audit-logs");
  await delay(130);
  return clone(AUDIT_LOGS);
}

export async function fetchResults() {
  await delay(120);
  return clone(RESULTS);
}

export async function submitConcern(_payload: {
  toCandidateId: string;
  category: string;
  subject: string;
  message: string;
  attachmentFile?: File;
}): Promise<VoterConcern> {
  const token = getAuthToken();
  if (!DEMO_MODE && token) {
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

      // Step 2: Create concern with attachment URL
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
          fromName: VOTER.name,
          department: VOTER.department,
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
      if (DEMO_MODE) {
        console.warn("Falling back to demo concern because DEMO_MODE is enabled.");
      } else {
        throw e;
      }
    }
  }

  if (!DEMO_MODE) {
    throw new Error("Unable to submit concern to live backend.");
  }

  await delay(280);
  return {
    id: `vc-${Date.now()}`,
    fromName: VOTER.name,
    department: VOTER.department,
    toCandidateId: _payload.toCandidateId,
    category: _payload.category,
    message: `${_payload.subject}\n${_payload.message}`,
    submittedAt: "Just now",
  };
}

export async function sendAiMessage(text: string) {
  // Call the real backend AI chat endpoint with a one-off session
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
    return { reply: data.reply, source: data.is_mock ? "(Demo mode)" : "AI Service" };
  } catch (e) {
    console.warn("sendAiMessage fell back to mock:", e);
    await delay(400);
    return {
      reply: `Based on the manifestos, Priya Sharma's plan most directly addresses "${text.slice(0, 48)}..." with specific commitments to upgrade campus Wi-Fi, expand placement training, and improve student welfare programs.`,
      source: "(Demo fallback)",
    };
  }
}
