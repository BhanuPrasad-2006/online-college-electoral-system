import { useQuery } from "@tanstack/react-query";
import {
  fetchConcernCategories,
  fetchElection,
  fetchMediaItems,
  fetchVoterConcerns,
  fetchVoterProfile,
} from "@/lib/demo-api";

import {
  fetchCandidates,
  fetchCandidateProfile,
  fetchDeptTurnout,
  fetchHourlyVotes,
  fetchKpi,
  fetchNotifications,
  fetchAiAlerts,
  fetchAuditLogs,
  fetchCandidateConcernReport,
  getCurrentPhase,
} from "@/lib/api";

const demoQuery = {
  retry: false,
  refetchOnWindowFocus: false,
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 30,
};

const liveQuery = {
  retry: 1,
  refetchOnWindowFocus: false,
  refetchIntervalInBackground: false,
  staleTime: 30_000,
  refetchInterval: 60_000,
};

export function useElection() {
  return useQuery({ queryKey: ["election"], queryFn: fetchElection, ...demoQuery });
}

export function useCurrentPhase() {
  return useQuery({
    queryKey: ["election-phase"],
    queryFn: getCurrentPhase,
    ...liveQuery,
  });
}

export function useCandidates() {
  return useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates, ...demoQuery });
}

export function useKpi() {
  return useQuery({ queryKey: ["kpi"], queryFn: fetchKpi, ...liveQuery });
}

export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications, ...liveQuery });
}

export function useMediaItems() {
  return useQuery({ queryKey: ["media"], queryFn: fetchMediaItems, ...demoQuery });
}

export function useVoterProfile() {
  return useQuery({ queryKey: ["voter-profile"], queryFn: fetchVoterProfile, ...demoQuery });
}

export function useCandidateProfile() {
  return useQuery({ queryKey: ["candidate-profile"], queryFn: fetchCandidateProfile, ...demoQuery });
}

export function useConcernCategories() {
  return useQuery({ queryKey: ["concern-categories"], queryFn: fetchConcernCategories, ...demoQuery });
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

export function useAuditLogs() {
  return useQuery({ queryKey: ["audit-logs"], queryFn: fetchAuditLogs, ...demoQuery });
}

export function useCandidateConcernReport() {
  return useQuery({
    queryKey: ["candidate-concern-report"],
    queryFn: fetchCandidateConcernReport,
    ...demoQuery,
  });
}
