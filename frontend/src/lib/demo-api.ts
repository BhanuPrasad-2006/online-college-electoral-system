/**
 * Demo API layer — simulates network latency without calling a real backend.
 *
 * When the API is ready, replace each function body with the commented fetch pattern
 * and set DEMO_MODE to false in demo-config.ts.
 */
import { DEMO_MODE } from "./demo-config";
import { getAuthToken, fetchCurrentElection } from "./api";
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

const delay = (ms = 140) => new Promise<void>((r) => setTimeout(r, ms));
const CLIENT_HOST =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";
const LIVE_API_HOST =
  CLIENT_HOST === "localhost" || CLIENT_HOST === "::1"
    ? "localhost"
    : CLIENT_HOST;
const LIVE_API_BASE = `http://${LIVE_API_HOST}:8000/api/v1`;
const LIVE_PROFILE_RETRY_DELAY_MS = 350;

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

    await delay(LIVE_PROFILE_RETRY_DELAY_MS);
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
  // return apiGet<Candidate[]>("/candidates");
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
  // return apiGet<MediaItem[]>("/media?status=approved");
  await delay(120);
  return clone(MEDIA_ITEMS);
}

export async function fetchVoterProfile() {
  const token = getAuthToken();
  if (!token) {
    await delay(90);
    return clone(VOTER);
  }

  try {
    return await fetchLiveProfile("/auth/voter/me", token);
  } catch (e) {
    console.error("Voter profile fetch failed, falling back to mock:", e);
    return clone(VOTER);
  }
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
  // return apiGet<typeof CONCERN_CATEGORIES>("/ai/concern-categories");
  await delay(110);
  return clone(CONCERN_CATEGORIES);
}

export async function fetchVoterConcerns(): Promise<VoterConcern[]> {
  // return apiGet<VoterConcern[]>("/voter/concerns");
  await delay(100);
  return clone(VOTER_CONCERNS);
}

export async function fetchHourlyVotes() {
  // return apiGet<typeof HOURLY_VOTES>("/election/stats/hourly");
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
  // return apiGet<typeof RESULTS>("/election/results");
  await delay(120);
  return clone(RESULTS);
}

export async function submitConcern(_payload: {
  toCandidateId: string;
  category: string;
  subject: string;
  message: string;
}): Promise<VoterConcern> {
  // return apiPost<VoterConcern>("/voter/concerns", payload);
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

export async function sendAiMessage(_text: string) {
  // return apiPost<{ reply: string; source?: string }>("/voter/ai/chat", { message: text });
  await delay(400);
  return {
    reply: `Based on the manifestos, Priya Sharma's plan most directly addresses "${_text.slice(0, 48)}…" with specific commitments to upgrade campus Wi-Fi, expand placement training, and improve student welfare programs.`,
    source: "Source: Priya Sharma's manifesto — Infrastructure & Placements sections",
  };
}
