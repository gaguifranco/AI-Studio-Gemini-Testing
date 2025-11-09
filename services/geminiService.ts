import { GoogleGenAI, Type } from "@google/genai";
import type { UserProfile, GeminiAnalysisResult, GeminiAnalysisResultWithQuality } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const nutritionalInfoSchema = {
    type: Type.OBJECT,
    description: "Estimativa nutricional do prato para uma porção de 100g, baseada na soma dos ingredientes encontrados nas fontes de dados permitidas. Se a informação não puder ser encontrada, os campos podem ser 'N/A'.",
    properties: {
        calories: { type: Type.STRING, description: "Total de calorias (ex: '450 kcal')." },
        carbohydrates: { type: Type.STRING, description: "Total de carboidratos (ex: '30g')." },
        fats: { type: Type.STRING, description: "Total de gorduras (ex: '20g')." },
        protein: { type: Type.STRING, description: "Total de proteínas (ex: '25g')." },
        sodium: { type: Type.STRING, description: "Total de sódio (ex: '600mg')." },
    },
    required: ["calories", "carbohydrates", "fats", "protein", "sodium"],
};

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
    category: {
      type: Type.STRING,
      description: "A categoria do prato (ex: Entrada, Prato Principal, Sobremesa, Bebida).",
    },
    nutritionalInfo: {
        ...nutritionalInfoSchema,
        description: "Estimativa nutricional do prato para uma porção de 100g. Este campo é obrigatório."
    }
  },
  required: ["dishName", "description", "price", "reasonForRecommendation", "category"],
};


export const analyzeMenu = async (profile: UserProfile, images: Array<{ base64: string; mimeType: string }>, suggestionCount: number): Promise<GeminiAnalysisResult> => {
  const model = "gemini-2.5-flash";

  const profileText = `
    Analise as seguintes imagens do menu de um restaurante e forneça sugestões de refeições com base neste perfil de usuário:
    - Gostos e Sabores: ${profile.tastes || 'Não especificado'}
    - Alergias: ${profile.allergies || 'Nenhuma especificada'}
    - Preferências Gastronômicas (ex: vegano, vegetariano): ${profile.preferences || 'Nenhuma preferência específica'}
    - Humor Atual: ${profile.mood || 'Neutro'}
    - Restrições Alimentares: ${profile.diet || 'Nenhuma'}
    - Orçamento: ${profile.budget || 'Flexível'}

    **Passo 1: Verificação de Qualidade da Imagem e Tentativa de OCR.**
    Primeiro, avalie a qualidade da imagem. Tente extrair o texto mesmo que a qualidade não seja perfeita (ex: levemente desfocada, iluminação irregular).
    - Se o texto principal (nomes dos pratos, preços) for decifrável, defina 'qualityCheck.isLegible' como verdadeiro.
    - Se a imagem for genuinamente ilegível, defina 'qualityCheck.isLegible' como falso e forneça um feedback específico e construtivo no campo 'qualityCheck.feedback'. Exemplos de bom feedback: 'O texto está muito borrado para ser lido', 'Há muito reflexo de luz sobre o menu', 'A imagem está escura demais para distinguir as letras'.

    **Passo 2: Análise e Recomendação (somente se o OCR for bem-sucedido).**
    Se 'qualityCheck.isLegible' for verdadeiro:
    1. Com base no texto extraído pelo OCR, analise os pratos, descrições e preços.
    2. Cruze as informações dos itens do menu com o perfil do usuário.
    3. Forneça exatamente ${suggestionCount} recomendações personalizadas no campo 'suggestions'. Se não encontrar tantas opções boas, pode fornecer menos, mas não mais que ${suggestionCount}.
    4. Para cada recomendação, explique *por que* ela é uma boa escolha e identifique sua categoria (ex: 'Entrada', 'Prato Principal', 'Sobremesa', 'Bebida').
    
    **Passo 3: Estimativa Nutricional para uma porção de 100g.**
    Para cada prato recomendado, você deve fornecer uma estimativa nutricional.
    1. Identifique os ingredientes principais do prato com base em seu nome e descrição.
    2. Para cada ingrediente, pesquise os valores nutricionais usando **exclusivamente** as seguintes fontes brasileiras:
       - Tabela Brasileira de Composição de Alimentos (TBCA): tbca.net.br
       - Tabela TACO Online: tabelatacoonline.com.br
       - Nutritotal: nutritotal.com.br
    3. **Importante:** Se um ingrediente não for encontrado em nenhuma dessas três fontes, ignore-o e continue com os próximos. Não use outras fontes.
    4. Com base nos ingredientes encontrados, calcule a soma total dos valores nutricionais para uma **porção padrão de 100g** do prato.
    5. Preencha o objeto 'nutritionalInfo' com os dados para 100g do prato: Calorias, Carboidratos, Gorduras, Proteína e Sódio.
    6. O campo 'nutritionalInfo' é obrigatório. Faça a melhor estimativa possível com os dados disponíveis nas fontes permitidas.

    Se 'qualityCheck.isLegible' for falso, deixe o campo 'suggestions' vazio ou nulo.
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
            qualityCheck: {
                type: Type.OBJECT,
                description: "Avaliação da qualidade e legibilidade da imagem do menu.",
                properties: {
                  isLegible: {
                    type: Type.BOOLEAN,
                    description: "Indica se o texto no menu é legível o suficiente para análise."
                  },
                  feedback: {
                    type: Type.STRING,
                    description: "Feedback sobre a qualidade da imagem se não for legível (ex: 'A imagem está muito desfocada', 'A iluminação é fraca')."
                  }
                },
                required: ["isLegible", "feedback"],
            },
            suggestions: {
              type: Type.ARRAY,
              items: suggestionSchema,
              description: "Uma lista de sugestões de refeições personalizadas. Só é preenchido se isLegible for verdadeiro."
            }
          },
          required: ["qualityCheck"],
        },
      },
    });

    const jsonText = response.text.trim();

    if (!jsonText) {
        throw new Error("A IA retornou uma resposta vazia. Isso pode acontecer devido a imagens de menu muito escuras, desfocadas ou ilegíveis. Por favor, tente tirar fotos de melhor qualidade.");
    }

    let result: GeminiAnalysisResultWithQuality;
    try {
        result = JSON.parse(jsonText);
    } catch (jsonError) {
        console.error("Failed to parse Gemini response as JSON:", jsonText);
        throw new Error("A IA retornou uma resposta em um formato inesperado. Verifique se as imagens do menu estão claras e tente novamente.");
    }
    
    if (!result.qualityCheck) {
        throw new Error("A resposta da IA está incompleta. Não foi possível verificar a qualidade da imagem.");
    }

    if (!result.qualityCheck.isLegible) {
        // Use the specific feedback from the AI to guide the user.
        const feedback = result.qualityCheck.feedback || 'Qualidade de imagem insuficiente.';
        throw new Error(`Não foi possível ler o menu. Motivo: ${feedback}. Por favor, tente tirar uma nova foto com mais nitidez, melhor iluminação e sem reflexos.`);
    }

    if (!result.suggestions || result.suggestions.length === 0) {
      throw new Error("Nenhuma sugestão encontrada. O menu pode não conter pratos que correspondam ao seu perfil, ou a IA pode não ter conseguido ler as imagens corretamente. Tente usar fotos mais nítidas e com boa iluminação.");
    }
    
    return { suggestions: result.suggestions };
  } catch (error) {
    console.error("Error analyzing menu with Gemini:", error);
    if (error instanceof Error) {
        // Re-throw our custom, user-friendly errors directly.
        if (error.message.startsWith("A IA") || error.message.startsWith("Nenhuma sugestão") || error.message.startsWith("Não foi possível ler")) {
            throw error;
        }

        // Create user-friendly messages for common technical problems.
        if (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch')) {
            throw new Error("Houve um problema de conexão ao contatar a IA. Verifique sua conexão com a internet e tente novamente.");
        }
        
        // Generic catch-all for other API errors.
        throw new Error(`Falha ao obter recomendações da IA. A resposta do servidor foi: ${error.message}`);
    }
    throw new Error("Ocorreu um erro desconhecido ao analisar o menu.");
  }
};