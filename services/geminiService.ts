
import { GoogleGenAI, Type } from "@google/genai";
import type { UserProfile, GeminiAnalysisResult } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const suggestionSchema = {
  type: Type.OBJECT,
  properties: {
    dishName: {
      type: Type.STRING,
      description: "O nome do prato.",
    },
    description: {
      type: Type.STRING,
      description: "Uma breve descrição do prato retirada do menu.",
    },
    price: {
      type: Type.STRING,
      description: "O preço do prato como listado no menu.",
    },
    reasonForRecommendation: {
      type: Type.STRING,
      description: "Uma explicação detalhada do porquê este prato é uma boa combinação para o perfil do usuário.",
    },
  },
  required: ["dishName", "description", "price", "reasonForRecommendation"],
};


export const analyzeMenu = async (profile: UserProfile, images: Array<{ base64: string; mimeType: string }>): Promise<GeminiAnalysisResult> => {
  const model = "gemini-2.5-flash";

  const profileText = `
    Analise as seguintes imagens do menu de um restaurante e forneça sugestões de refeições com base neste perfil de usuário:
    - Gostos e Sabores: ${profile.tastes.join(', ') || 'Não especificado'}
    - Alergias: ${profile.allergies.join(', ') || 'Nenhuma especificada'}
    - Preferências Gastronômicas (ex: vegano, vegetariano): ${profile.preferences.join(', ') || 'Nenhuma preferência específica'}
    - Humor Atual: ${profile.mood || 'Neutro'}
    - Restrições Alimentares: ${profile.diet.join(', ') || 'Nenhuma'}
    - Orçamento: ${profile.budget || 'Flexível'}

    Primeiro, execute o OCR em todas as páginas do menu para entender os pratos, descrições e preços disponíveis.
    Em seguida, cruze as informações dos itens do menu com o perfil do usuário.
    Forneça de 3 a 5 recomendações personalizadas. Para cada recomendação, explique *por que* ela é uma boa escolha.
  `;

  const imageParts = images.map(image => ({
    inlineData: {
      data: image.base64,
      mimeType: image.mimeType,
    },
  }));


  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { text: profileText },
          ...imageParts,
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: suggestionSchema,
              description: "Uma lista de sugestões de refeições personalizadas."
            }
          },
        },
      },
    });

    const jsonText = response.text.trim();
    const result: GeminiAnalysisResult = JSON.parse(jsonText);
    
    if (!result.suggestions || result.suggestions.length === 0) {
      throw new Error("O modelo não retornou nenhuma sugestão. O menu pode estar ilegível ou não ter opções adequadas.");
    }
    
    return result;
  } catch (error) {
    console.error("Error analyzing menu with Gemini:", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao obter recomendações da IA: ${error.message}`);
    }
    throw new Error("Ocorreu um erro desconhecido ao analisar o menu.");
  }
};