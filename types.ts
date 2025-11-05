export interface UserProfile {
  tastes: string[];
  allergies: string[];
  preferences: string[];
  mood: string;
  diet: string[];
  budget: string;
}

export interface Suggestion {
  dishName: string;
  description: string;
  price: string;
  reasonForRecommendation: string;
}

export interface GeminiAnalysisResult {
  suggestions: Suggestion[];
}
