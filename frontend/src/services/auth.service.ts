import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/lib/constants';
import type { LoginRequest, RegisterRequest, OTPVerifyRequest, AuthTokens, User } from '@/types';

export const authService = {
  async login(data: LoginRequest): Promise<AuthTokens> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, data);
    return response.data;
  },

  async register(data: RegisterRequest): Promise<{ message: string }> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, data);
    return response.data;
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, { email });
    return response.data;
  },

  async verifyOTP(data: OTPVerifyRequest): Promise<AuthTokens> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.VERIFY_OTP, data);
    return response.data;
  },

  async getMe(): Promise<User> {
    const response = await apiClient.get(API_ENDPOINTS.AUTH.ME);
    return response.data;
  },

  async logout(): Promise<void> {
    await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REFRESH, { refresh_token: refreshToken });
    return response.data;
  },
};
