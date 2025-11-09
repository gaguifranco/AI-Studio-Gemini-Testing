export interface UserProfile {
  tastes: string;
  allergies: string;
  preferences: string;
  mood: string;
  diet: string;
  budget: string;
}

export interface NutritionalInfo {
  calories: string;
  carbohydrates: string;
  fats: string;
  protein: string;
  sodium: string;
}

export interface Suggestion {
  dishName: string;
  description:string;
  price: string;
  reasonForRecommendation: string;
  category: string;
  nutritionalInfo?: NutritionalInfo;
}

export interface GeminiAnalysisResult {
  suggestions: Suggestion[];
}

export interface GeminiAnalysisResultWithQuality extends GeminiAnalysisResult {
  qualityCheck: {
    isLegible: boolean;
    feedback: string;
  };
}
