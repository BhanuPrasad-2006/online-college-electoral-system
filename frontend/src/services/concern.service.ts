import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/lib/constants';
import type { Concern, ConcernCreate, PaginatedResponse } from '@/types';

export const concernService = {
  async list(page = 1, pageSize = 20): Promise<PaginatedResponse<Concern>> {
    const response = await apiClient.get(API_ENDPOINTS.CONCERNS.LIST, {
      params: { page, page_size: pageSize },
    });
    return response.data;
  },

  async create(data: ConcernCreate): Promise<Concern> {
    const response = await apiClient.post(API_ENDPOINTS.CONCERNS.CREATE, data);
    return response.data;
  },

  async upvote(concernId: string): Promise<{ upvotes: number }> {
    const response = await apiClient.post(`${API_ENDPOINTS.CONCERNS.UPVOTE}/${concernId}`);
    return response.data;
  },

  async getReport(): Promise<Record<string, unknown>> {
    const response = await apiClient.get(API_ENDPOINTS.CONCERNS.REPORT);
    return response.data;
  },
};
