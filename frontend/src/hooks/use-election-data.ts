import { useQuery } from "@tanstack/react-query";
import {
  fetchElection,
  fetchHourlyVotes,
  fetchMediaItems,
  fetchResults,
  fetchVoterConcerns,
  fetchVoterProfile,
} from "@/lib/demo-api";

import {
  fetchCandidates,
  fetchCandidateProfile,
  fetchDeptTurnout,
  fetchKpi,
  fetchNotifications,
  fetchAiAlerts,
  fetchAuditLogs,
  fetchConcernCategories,
  fetchCandidateConcernReport,
  fetchPublicResults,
  getAuthToken,
  getCurrentPhase,
} from "@/lib/api";



const demoQuery = {
  retry: false,
  refetchOnWindowFocus: false,
  staleTime: 1000 * 60 * 30,
};

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
  refetchInterval: 10000, // Real-time: refetch every 10 seconds
};

export function useElection() {
  return useQuery({ queryKey: ["election"], queryFn: fetchElection, ...slowQuery });
}

export function useCurrentPhase() {
  return useQuery({
    queryKey: ["election-phase"],
    queryFn: getCurrentPhase,
    ...normalQuery,
  });
}

export function useCandidates() {
  return useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates, ...demoQuery });
}

export function useKpi() {
  return useQuery({ queryKey: ["kpi"], queryFn: fetchKpi, ...fastQuery });
}

export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications, ...normalQuery });
}

export function useMediaItems() {
  return useQuery({ queryKey: ["media"], queryFn: fetchMediaItems, ...demoQuery });
}

export function useVoterProfile() {
  // Include auth token in query key so different users get separate cache entries.
  // This prevents showing Voter A's cached profile to Voter B after login.
  const token = typeof window !== "undefined" ? getAuthToken() : "no-token";
  return useQuery({
    queryKey: ["voter-profile", token],
    queryFn: fetchVoterProfile,
    ...demoQuery,
    staleTime: 0, // Always fetch fresh data from server on mount/invalidation
  });
}

export function useCandidateProfile() {
  return useQuery({
    queryKey: ["candidate-profile"],
    queryFn: fetchCandidateProfile,
    ...demoQuery,
  });
}

export function useConcernCategories() {
  return useQuery({ queryKey: ["concern-categories"], queryFn: fetchConcernCategories, ...liveQuery });
}

export function useVoterConcerns() {
  return useQuery({ queryKey: ["voter-concerns"], queryFn: fetchVoterConcerns, ...demoQuery });
}

export function useHourlyVotes() {
  return useQuery({ queryKey: ["hourly-votes"], queryFn: fetchHourlyVotes, ...demoQuery });
}

export function useDeptTurnout() {
  return useQuery({ queryKey: ["dept-turnout"], queryFn: fetchDeptTurnout, ...demoQuery });
}

export function useAiAlerts() {
  return useQuery({ queryKey: ["ai-alerts"], queryFn: fetchAiAlerts, ...demoQuery });
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
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => fetchAuditLogs(params),
    ...demoQuery,
  });
}

export function usePublicResults() {
  return useQuery({
    queryKey: ["public-results"],
    queryFn: fetchPublicResults,
    ...slowQuery,
  });
}

export function useResults() {
  return useQuery({ queryKey: ["results"], queryFn: fetchResults, ...demoQuery });
}

export function useCandidateConcernReport() {
  return useQuery({
    queryKey: ["candidate-concern-report"],
    queryFn: fetchCandidateConcernReport,
    ...demoQuery,
  });
}

