import { useState, useEffect } from 'react';
import type { Recommendation } from '@/types';

export function useRecommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        // TODO: Integrate with AI service
        setRecommendations([]);
      } catch {
        console.error('Failed to fetch recommendations');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecommendations();
  }, []);

  return { recommendations, isLoading };
}
