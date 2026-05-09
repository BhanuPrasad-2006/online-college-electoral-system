/**
 * Shared Concern Types — Single source of truth for frontend ↔ backend.
 */

export type ConcernStatus = 'open' | 'in_review' | 'addressed' | 'closed';

export type ConcernCategory =
  | 'academic'
  | 'infrastructure'
  | 'campus_life'
  | 'administration'
  | 'other';

export interface Concern {
  id: string;
  title: string;
  description: string;
  category: ConcernCategory;
  status: ConcernStatus;
  upvotes: number;
  user_id: string;
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

export interface ConcernUpdate {
  title?: string;
  description?: string;
  category?: ConcernCategory;
  status?: ConcernStatus;
}
