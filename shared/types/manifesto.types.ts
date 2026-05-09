/**
 * Shared Manifesto Types — Single source of truth for frontend ↔ backend.
 */

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

export interface ManifestoCreate {
  candidate_id: string;
  title: string;
  content: string;
  goals: Omit<ManifestoGoal, 'id'>[];
}

export interface ManifestoUpdate {
  title?: string;
  content?: string;
  goals?: ManifestoGoal[];
}
