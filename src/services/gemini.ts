import { GoogleGenAI, Modality, Type } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  return new GoogleGenAI({ apiKey });
};

export const generateText = async (prompt: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
  });
  return response.text;
};

export const generateImage = async (prompt: string, imageBase64?: string) => {
  const ai = getAI();
  const parts: any[] = [{ text: prompt }];
  
  if (imageBase64) {
    parts.push({
      inlineData: {
        data: imageBase64.split(',')[1] || imageBase64,
        mimeType: "image/png"
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};

export const generateAudio = async (text: string, voice: string = "Kore") => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice as any },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    return `data:audio/wav;base64,${base64Audio}`;
  }
  throw new Error("No audio generated");
};

export const generateVideo = async (prompt: string, imageBase64?: string) => {
  // For Veo, we need to check for API key selection
  if (!(window as any).aistudio?.hasSelectedApiKey()) {
    await (window as any).aistudio?.openSelectKey();
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
  
  const videoConfig: any = {
    model: "veo-3.1-fast-generate-preview",
    prompt,
    config: {
      numberOfVideos: 1,
      resolution: "720p",
      aspectRatio: "16:9",
    },
  };

  if (imageBase64) {
    videoConfig.image = {
      imageBytes: imageBase64.split(',')[1] || imageBase64,
      mimeType: 'image/png',
    };
  }

  let operation = await ai.models.generateVideos(videoConfig);

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed");

  const response = await fetch(downloadLink, {
    method: "GET",
    headers: {
      "x-goog-api-key": process.env.API_KEY || process.env.GEMINI_API_KEY || "",
    },
  });

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
