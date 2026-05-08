import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/lib/constants';
import type { Candidate, CandidateApplication, PaginatedResponse } from '@/types';

export const candidateService = {
  async list(electionId?: string): Promise<PaginatedResponse<Candidate>> {
    const response = await apiClient.get(API_ENDPOINTS.CANDIDATES.LIST, {
      params: { election_id: electionId },
    });
    return response.data;
  },

  async apply(data: CandidateApplication): Promise<Candidate> {
    const response = await apiClient.post(API_ENDPOINTS.CANDIDATES.APPLY, data);
    return response.data;
  },

  async approve(candidateId: string): Promise<Candidate> {
    const response = await apiClient.post(`${API_ENDPOINTS.CANDIDATES.APPROVE}/${candidateId}`);
    return response.data;
  },

  async reject(candidateId: string, reason: string): Promise<Candidate> {
    const response = await apiClient.post(`${API_ENDPOINTS.CANDIDATES.REJECT}/${candidateId}`, { reason });
    return response.data;
  },
};
