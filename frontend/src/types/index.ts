// ========================
// User & Auth Types
// ========================
export type UserRole = 'student' | 'candidate' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  roll_number: string;
  department: string;
  year: number;
  role: UserRole;
  avatar_url?: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  roll_number: string;
  department: string;
  year: number;
}

export interface OTPVerifyRequest {
  email: string;
  otp: string;
}

// ========================
// Election Types
// ========================
export type ElectionStatus = 'upcoming' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface Election {
  id: string;
  title: string;
  description: string;
  status: ElectionStatus;
  start_time: string;
  end_time: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ========================
// Candidate Types
// ========================
export type CandidateStatus = 'pending' | 'approved' | 'rejected';

export interface Candidate {
  id: string;
  user_id: string;
  election_id: string;
  position: string;
  status: CandidateStatus;
  manifesto?: Manifesto;
  user?: User;
  vote_count?: number;
  created_at: string;
}

export interface CandidateApplication {
  election_id: string;
  position: string;
  statement: string;
}

// ========================
// Manifesto Types
// ========================
export interface Manifesto {
  id: string;
  candidate_id: string;
  title: string;
  content: string;
  goals: ManifestoGoal[];
  ai_analysis?: ManifestoAnalysis;
  created_at: string;
  updated_at: string;
}

export interface ManifestoGoal {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ManifestoAnalysis {
  sentiment_score: number;
  feasibility_score: number;
  key_themes: string[];
  summary: string;
}

// ========================
// Vote Types
// ========================
export interface VoteSubmission {
  election_id: string;
  candidate_id: string;
  position: string;
  jit_token: string;
}

export interface VoteReceipt {
  receipt_hash: string;
  timestamp: string;
  position: string;
}

// ========================
// Concern Types
// ========================
export type ConcernStatus = 'open' | 'in_review' | 'addressed' | 'closed';
export type ConcernCategory = 'academic' | 'infrastructure' | 'campus_life' | 'administration' | 'other';

export interface Concern {
  id: string;
  title: string;
  description: string;
  category: ConcernCategory;
  status: ConcernStatus;
  upvotes: number;
  user_id: string;
  user?: User;
  ai_classification?: string;
  sentiment_score?: number;
  created_at: string;
  updated_at: string;
}

export interface ConcernCreate {
  title: string;
  description: string;
  category: ConcernCategory;
}

// ========================
// Analytics Types
// ========================
export interface ElectionStats {
  total_voters: number;
  votes_cast: number;
  participation_rate: number;
  department_breakdown: DepartmentStat[];
  hourly_votes: HourlyVoteStat[];
}

export interface DepartmentStat {
  department: string;
  total_eligible: number;
  votes_cast: number;
  percentage: number;
}

export interface HourlyVoteStat {
  hour: string;
  count: number;
}

// ========================
// AI / Recommendation Types
// ========================
export interface Recommendation {
  candidate_id: string;
  candidate: Candidate;
  match_score: number;
  matching_themes: string[];
  explanation: string;
}

export interface FraudAlert {
  id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata: Record<string, unknown>;
  is_resolved: boolean;
  created_at: string;
}

// ========================
// Audit Log Types
// ========================
export interface AuditLog {
  id: string;
  action: string;
  actor_id: string;
  actor?: User;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

// ========================
// API Response Types
// ========================
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  detail: string;
  status_code: number;
}
