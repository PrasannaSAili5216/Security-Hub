import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface PIIResult {
  sensitiveData: string[];
  suggestions: string;
  isSafe: boolean;
  redactedImage?: string;
  maskedImage?: string;
}

export const analyzeTextPII = async (text: string, documentData?: { data: string, mimeType: string }): Promise<PIIResult> => {
  const model = "gemini-3-flash-preview";
  
  const contents = documentData ? {
    parts: [
      {
        inlineData: {
          mimeType: documentData.mimeType,
          data: documentData.data.split(",")[1] || documentData.data
        }
      },
      {
        text: `Analyze the attached document for Personally Identifiable Information (PII) like phone numbers, addresses, emails, social security numbers, or full names. 
        Return a JSON object with:
        - sensitiveData: array of strings found
        - suggestions: string explaining why this is dangerous and how to fix it
        - isSafe: boolean`
      }
    ]
  } : `Analyze the following text for Personally Identifiable Information (PII) like phone numbers, addresses, emails, social security numbers, or full names. 
    Return a JSON object with:
    - sensitiveData: array of strings found
    - suggestions: string explaining why this is dangerous and how to fix it
    - isSafe: boolean
    
    Text: "${text}"`;

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sensitiveData: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestions: { type: Type.STRING },
          isSafe: { type: Type.BOOLEAN }
        },
        required: ["sensitiveData", "suggestions", "isSafe"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const analyzeImagePII = async (base64Image: string): Promise<PIIResult> => {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.split(",")[1] || base64Image
          }
        },
        {
          text: `Identify any sensitive personal information visible in this image (names, numbers, addresses, IDs). 
          Return a JSON object with:
          - sensitiveData: array of strings describing what was found
          - suggestions: string explaining why this is dangerous and how to fix it
          - isSafe: boolean`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sensitiveData: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestions: { type: Type.STRING },
          isSafe: { type: Type.BOOLEAN }
        },
        required: ["sensitiveData", "suggestions", "isSafe"]
      }
    }
  });

  const result: PIIResult = JSON.parse(response.text || "{}");

  if (!result.isSafe) {
    try {
      const editResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(",")[1] || base64Image
              }
            },
            {
              text: "Apply heavy masking and blurring to this image. Specifically: 1. Completely blur or pixelate the person's face/portrait. 2. Mask or blur all QR codes and barcodes. 3. Blur or mask sensitive ID numbers (like Aadhaar or Social Security numbers), leaving only the last few digits visible if appropriate. 4. Ensure the masking is heavy and obvious (like a security mask) so no sensitive details can be recovered, while keeping the general layout of the document recognizable."
            }
          ]
        }
      });

      for (const part of editResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          result.redactedImage = `data:image/jpeg;base64,${part.inlineData.data}`;
          break;
        }
      }
    } catch (e) {
      console.error("Redaction failed", e);
    }
  }

  return result;
};

export const maskAadhaarImage = async (base64Image: string): Promise<string | null> => {
  try {
    const model = "gemini-2.5-flash-image";
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1] || base64Image
            }
          },
          {
            text: `You are a specialized Aadhaar Masking Tool. 
            Your task is to create a "Masked Aadhaar" version of the provided image.
            
            Strict Masking Rules:
            1. PHOTO: Completely blur or pixelate the person's photograph/portrait.
            2. QR CODE: Completely blur or pixelate the QR code.
            3. AADHAAR NUMBER: Mask the first 8 digits of the 12-digit Aadhaar number (e.g., XXXX XXXX 1234). The last 4 digits MUST remain visible.
            4. OTHER DETAILS: Keep the name, DOB, and gender visible as they are not usually masked in a standard masked Aadhaar.
            5. STYLE: The masking should look professional, using a pixelated or blurred effect that is clearly intentional and secure.
            
            Return only the masked image.`
          }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/jpeg;base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {
    console.error("Masking failed", e);
  }
  return null;
};

export const analyzeAudioPII = async (base64Audio: string, mimeType: string): Promise<PIIResult> => {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Audio.split(",")[1] || base64Audio
          }
        },
        {
          text: `Listen to this audio and identify any sensitive personal information mentioned (names, phone numbers, addresses, account details). 
          Return a JSON object with:
          - sensitiveData: array of strings describing what was found
          - suggestions: string explaining why this is dangerous and how to fix it
          - isSafe: boolean`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sensitiveData: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestions: { type: Type.STRING },
          isSafe: { type: Type.BOOLEAN }
        },
        required: ["sensitiveData", "suggestions", "isSafe"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const analyzeVideoPII = async (base64Video: string, mimeType: string): Promise<PIIResult> => {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Video.split(",")[1] || base64Video
          }
        },
        {
          text: `Watch this video and identify any sensitive personal information visible or audible (names, numbers, IDs, documents, background details that reveal location). 
          Return a JSON object with:
          - sensitiveData: array of strings describing what was found
          - suggestions: string explaining why this is dangerous and how to fix it
          - isSafe: boolean`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sensitiveData: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestions: { type: Type.STRING },
          isSafe: { type: Type.BOOLEAN }
        },
        required: ["sensitiveData", "suggestions", "isSafe"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export interface CipherResult {
  output: string;
  explanation: string;
  keyUsed?: string;
  originalMimeType?: string;
  originalFileName?: string;
  binaryOutput?: string;
}

export const processTextCipher = async (text: string, operation: 'encode' | 'decode', documentData?: { data: string, mimeType: string }): Promise<CipherResult> => {
  const model = "gemini-3-flash-preview";
  
  const contents = documentData ? {
    parts: [
      {
        inlineData: {
          mimeType: documentData.mimeType,
          data: documentData.data.split(",")[1] || documentData.data
        }
      },
      {
        text: `You are a master cryptographer. 
        Operation: ${operation}
        
        If operation is 'decode', take the obfuscated text (symbols/numbers) from the attached document and reveal the hidden message.
        If operation is 'encode', take the plain text from the attached document and turn it into a complex hacker-style cipher using symbols and numbers.
        
        Return a JSON object with:
        - output: the processed text
        - explanation: a brief technical explanation of the "algorithm" used
        - keyUsed: a simulated 16-character hex key
        - binaryOutput: if operation is 'decode', provide the revealed message converted into a raw binary string (0s and 1s)
        - visualPrompt: a highly detailed prompt for an image generation model to create a visual representation of this document (including layout and any images described or found)`
      }
    ]
  } : `You are a master cryptographer. 
    Operation: ${operation}
    Input: "${text}"
    
    If operation is 'decode', take the obfuscated text (symbols/numbers) and reveal the hidden message.
    If operation is 'encode', take the plain text and turn it into a complex hacker-style cipher using symbols and numbers.
    
    Return a JSON object with:
    - output: the processed text
    - explanation: a brief technical explanation of the "algorithm" used
    - keyUsed: a simulated 16-character hex key
    - binaryOutput: if operation is 'decode', provide the revealed message converted into a raw binary string (0s and 1s)
    - visualPrompt: a highly detailed prompt for an image generation model to create a visual representation of this document (including layout and any images described or found)`;

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          output: { type: Type.STRING },
          explanation: { type: Type.STRING },
          keyUsed: { type: Type.STRING },
          binaryOutput: { type: Type.STRING },
          visualPrompt: { type: Type.STRING }
        },
        required: ["output", "explanation", "keyUsed"]
      }
    }
  });

  const result: CipherResult = JSON.parse(response.text || "{}");
  return result;
};

export const textToBinary = (text: string): string => {
  return text.split('').map(char => {
    return char.charCodeAt(0).toString(2).padStart(8, '0');
  }).join(' ');
};

export const base64ToBinary = (base64: string): string => {
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  try {
    const binaryString = atob(data);
    let result = '';
    const limit = Math.min(binaryString.length, 256);
    for (let i = 0; i < limit; i++) {
      result += binaryString.charCodeAt(i).toString(2).padStart(8, '0') + ' ';
    }
    return result + (binaryString.length > 256 ? '...' : '');
  } catch (e) {
    return "ERR_BINARY_CONVERSION_FAILED";
  }
};

export const redactPII = async (content: string, type: 'text' | 'image' | 'audio' | 'video'): Promise<{ redactedContent: string; summary: string }> => {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: `You are a data sanitization agent. 
    Input Type: ${type}
    Input Content: ${content.length > 1000 ? content.substring(0, 1000) + "..." : content}
    
    Task: Redact all Personally Identifiable Information (PII). 
    - For text: Replace names, numbers, and addresses with [REDACTED].
    - For media: Describe the redacted version of the media.
    
    Return a JSON object with:
    - redactedContent: the sanitized text or a description of the sanitized media
    - summary: a brief report of what was removed`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          redactedContent: { type: Type.STRING },
          summary: { type: Type.STRING }
        },
        required: ["redactedContent", "summary"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const processMediaCipher = async (base64Data: string, mimeType: string, operation: 'encrypt' | 'decrypt'): Promise<CipherResult> => {
  const model = "gemini-3-flash-preview";
  const mediaType = mimeType.split('/')[0];
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data.split(",")[1] || base64Data
          }
        },
        {
          text: `You are analyzing a ${mediaType} file. 
          Operation: ${operation}
          
          If 'decrypt': This image has been masked or redacted for security. Attempt to 'unmask' or 'reconstruct' the hidden details (faces, QR codes, numbers) to reveal the original information as accurately as possible.
          If 'encrypt': You are a security masking tool. Apply heavy masking to this document image. 1. Completely blur or black out any human faces/portraits. 2. Black out or heavily blur all QR codes and barcodes. 3. Mask sensitive identification numbers, leaving only the last 4 digits visible. 4. Ensure the masking looks like a professional security redaction.
          
          Return a JSON object with:
          - output: The ${operation === 'decrypt' ? 'detailed description of hidden content revealed' : 'dense cipher string representing the masked state'}
          - explanation: Technical details about the ${mediaType} ${operation === 'decrypt' ? 'reconstruction' : 'redaction'} process
          - keyUsed: A simulated 32-character security token`
        }
      ]
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          output: { type: Type.STRING },
          explanation: { type: Type.STRING },
          keyUsed: { type: Type.STRING }
        },
        required: ["output", "explanation", "keyUsed"]
      }
    }
  });

  const result: CipherResult = JSON.parse(response.text || "{}");
  return result;
};
