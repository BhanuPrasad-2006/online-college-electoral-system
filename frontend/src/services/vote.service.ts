import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/lib/constants';
import type { VoteSubmission, VoteReceipt } from '@/types';

export const voteService = {
  async getJITToken(): Promise<{ token: string }> {
    const response = await apiClient.post(API_ENDPOINTS.VOTE.JIT_TOKEN);
    return response.data;
  },

  async submitVote(data: VoteSubmission): Promise<VoteReceipt> {
    const response = await apiClient.post(API_ENDPOINTS.VOTE.SUBMIT, data);
    return response.data;
  },

  async verifyVote(receiptHash: string): Promise<{ valid: boolean }> {
    const response = await apiClient.post(API_ENDPOINTS.VOTE.VERIFY, { receipt_hash: receiptHash });
    return response.data;
  },

  async getReceipt(): Promise<VoteReceipt | null> {
    const response = await apiClient.get(API_ENDPOINTS.VOTE.RECEIPT);
    return response.data;
  },
};
