import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/lib/constants';
import type { Recommendation, ManifestoAnalysis } from '@/types';

export const aiService = {
  async classifyConcern(text: string): Promise<{ category: string; confidence: number }> {
    const response = await apiClient.post(API_ENDPOINTS.AI.CLASSIFY, { text });
    return response.data;
  },

  async getRecommendations(): Promise<Recommendation[]> {
    const response = await apiClient.get(API_ENDPOINTS.AI.RECOMMEND);
    return response.data;
  },

  async analyzeManifesto(content: string): Promise<ManifestoAnalysis> {
    const response = await apiClient.post(API_ENDPOINTS.AI.ANALYZE_MANIFESTO, { content });
    return response.data;
  },
};
