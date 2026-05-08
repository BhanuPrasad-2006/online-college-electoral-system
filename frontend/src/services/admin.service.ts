import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/lib/constants';
import type { User, AuditLog, FraudAlert, PaginatedResponse } from '@/types';

export const adminService = {
  async getUsers(page = 1, pageSize = 20): Promise<PaginatedResponse<User>> {
    const response = await apiClient.get(API_ENDPOINTS.ADMIN.USERS, {
      params: { page, page_size: pageSize },
    });
    return response.data;
  },

  async getAuditLogs(page = 1, pageSize = 50): Promise<PaginatedResponse<AuditLog>> {
    const response = await apiClient.get(API_ENDPOINTS.ADMIN.AUDIT_LOGS, {
      params: { page, page_size: pageSize },
    });
    return response.data;
  },

  async getFraudAlerts(): Promise<FraudAlert[]> {
    const response = await apiClient.get(API_ENDPOINTS.ADMIN.FRAUD_ALERTS);
    return response.data;
  },

  async resolveFraudAlert(alertId: string): Promise<FraudAlert> {
    const response = await apiClient.post(`${API_ENDPOINTS.ADMIN.FRAUD_ALERTS}/${alertId}/resolve`);
    return response.data;
  },
};
