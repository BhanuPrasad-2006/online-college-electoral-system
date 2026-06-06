import { useQuery } from "@tanstack/react-query";
import {
  fetchElection,
  fetchVoterProfile,
  fetchCandidateProfile,
  fetchVoterConcerns,
  fetchCandidates as liveFetchCandidatesFromDemo,
  fetchResults,
  fetchConcernCategories as liveFetchConcernCategories,
} from "@/lib/demo-api";

import {
  fetchCandidates,
  fetchDeptTurnout,
  fetchKpi,
  fetchNotifications,
  fetchAiAlerts,
  fetchAuditLogs,
  fetchCandidateConcernReport,
  fetchPublicResults,
  getAuthToken,
  getCurrentPhase,
  fetchMediaItems,
  fetchHourlyVotes,
} from "@/lib/api";


// Fast-polling: for metrics that change in real-time during voting (turnout, etc.)
const fastQuery = {
  retry: 1,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false,
  staleTime: 15_000,
  refetchInterval: 15_000,
};

// Normal polling: for moderately dynamic data (phase transitions, notifications)
const normalQuery = {
  retry: 1,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false,
  staleTime: 30_000,
  refetchInterval: 30_000,
};

// Slow polling: for rarely-changing reference data (election metadata, results)
const slowQuery = {
  retry: 1,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false,
  staleTime: 60_000,
  refetchInterval: 60_000,
};

const liveQuery = {
  retry: 2,
  refetchInterval: 10_000,
};

export function useElection() {
  return useQuery<any, Error>({ queryKey: ["election"], queryFn: fetchElection, ...slowQuery });
}

export function useCurrentPhase() {
  return useQuery({
    queryKey: ["election-phase"],
    queryFn: getCurrentPhase,
    ...normalQuery,
  });
}

export function useCandidates() {
  // Use live API directly — demo-api fetchCandidates also calls live endpoint in production
  return useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
    ...slowQuery,
  });
}

export function useKpi() {
  // Live: GET /election/kpi → { registered, votesCast, turnout, alerts }
  return useQuery({ queryKey: ["kpi"], queryFn: fetchKpi, ...fastQuery });
}

export function useNotifications() {
  // Live: GET /election/notifications → phase-aware real notifications + notices
  return useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications, ...normalQuery });
}

export function useMediaItems() {
  return useQuery({ queryKey: ["media"], queryFn: fetchMediaItems, ...normalQuery });
}

export function useVoterProfile() {
  const token = typeof window !== "undefined" ? getAuthToken() : "no-token";
  return useQuery({
    queryKey: ["voter-profile", token],
    queryFn: fetchVoterProfile,
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}

export function useCandidateProfile() {
  return useQuery<any, Error>({
    queryKey: ["candidate-profile"],
    queryFn: fetchCandidateProfile,
    ...slowQuery,
  });
}

export function useConcernCategories() {
  // Live: GET /concerns/categories
  return useQuery({
    queryKey: ["concern-categories"],
    queryFn: fetchConcernCategories,  // from live api
    ...liveQuery,
  });
}

function fetchConcernCategories() {
  return liveFetchConcernCategories();
}

export function useVoterConcerns() {
  return useQuery({ queryKey: ["voter-concerns"], queryFn: fetchVoterConcerns, ...normalQuery });
}

export function useHourlyVotes() {
  // Live: GET /election/stats/hourly
  return useQuery({ queryKey: ["hourly-votes"], queryFn: fetchHourlyVotes, ...slowQuery });
}

export function useDeptTurnout() {
  // Live: GET /election/stats/departments — real dept turnout from DB
  return useQuery({ queryKey: ["dept-turnout"], queryFn: fetchDeptTurnout, ...fastQuery });
}

export function useAiAlerts(options?: { enabled?: boolean }) {
  // Live: GET /admin/ai-alerts — real security alerts from DB
  return useQuery({
    queryKey: ["ai-alerts"],
    queryFn: fetchAiAlerts,
    ...normalQuery,
    enabled: options?.enabled ?? true,
  });
}

export function useAuditLogs(params?: {
  skip?: number;
  limit?: number;
  event_type?: string;
  actor?: string;
  ip?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
}) {
  // Live: GET /admin/audit-logs — real audit trail from DB
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => fetchAuditLogs(params),
    ...normalQuery,
  });
}

export function usePublicResults() {
  // Live: GET /election/public-results — gated by phase
  return useQuery({
    queryKey: ["public-results"],
    queryFn: fetchPublicResults,
    ...slowQuery,
  });
}

export function useResults() {
  // Live: GET /election/public-results
  return useQuery({ queryKey: ["results"], queryFn: fetchPublicResults, ...slowQuery });
}

export function useCandidateConcernReport() {
  // Live: GET /concerns/candidate-report
  return useQuery({
    queryKey: ["candidate-concern-report"],
    queryFn: fetchCandidateConcernReport,
    ...normalQuery,
  });
}
