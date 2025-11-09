import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceOption } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function generateStory(prompt: string, language: 'ar' | 'en'): Promise<string> {
  try {
    const model = 'gemini-2.5-flash';
    const langInstruction = language === 'ar' 
      ? `اكتب قصة قصيرة ومبتكرة باللغة العربية عن: "${prompt}"` 
      : `Write a short and creative story in English about: "${prompt}"`;

    const response = await ai.models.generateContent({
        model: model,
        contents: langInstruction,
        config: {
            systemInstruction: "You are a creative and engaging storyteller for all ages. Your stories should be imaginative and well-structured.",
        }
    });

    const story = response.text;
    if (!story) {
        throw new Error("The model did not return a story.");
    }
    return story.trim();
  } catch (error) {
    console.error("Error generating story:", error);
    throw new Error("Failed to generate the story.");
  }
}


export async function generateSpeech(text: string, voice: VoiceOption): Promise<string> {
  try {
    let effectiveVoice: string;
    let processedText = text;

    switch (voice) {
      case VoiceOption.ADAM: // Man
        effectiveVoice = 'Kore'; 
        processedText = `Speak as a man with a confident, natural, and high-quality human-like voice, at a conversational pace: ${text}`;
        break;
      case VoiceOption.LAYLA: // Woman
        effectiveVoice = 'Zephyr'; 
        processedText = `Speak as a woman with a warm, natural, and high-quality human-like voice, at a conversational pace: ${text}`;
        break;
      case VoiceOption.YUSUF: // Young Man
        effectiveVoice = 'Fenrir'; 
        processedText = `As a young man, speak with a bright, friendly, energetic, and clear voice. Your voice should be high-quality and human-like, at a natural, conversational pace: ${text}`;
        break;
      case VoiceOption.NORA: // Girl
        effectiveVoice = 'Puck'; 
        processedText = `Speak naturally as a young girl with a clear, high-quality, and human-like voice, at a conversational pace: ${text}`;
        break;
      case VoiceOption.OMAR: // Young Man
        effectiveVoice = 'Charon'; 
        processedText = `Speak as a young man with a calm, friendly, and high-quality human-like voice, at a conversational pace: ${text}`;
        break;
      case VoiceOption.HAMZA: // Man
        effectiveVoice = 'Fenrir'; 
        processedText = `As a mature man, speak with a very deep, resonant, charismatic, and high-quality human-like voice. Your tone should be calm and commanding, and your pace should be natural and conversational: ${text}`;
        break;
      default:
        // Fallback to a default voice if something unexpected is passed.
        effectiveVoice = 'Puck'; // Friendly seems like a safe default
        processedText = `Speak in a friendly, natural, high-quality, and human-like voice, at a conversational pace: ${text}`;
        break;
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: processedText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: effectiveVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("Could not generate audio data.");
    }

    return base64Audio;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw new Error("Failed to generate speech.");
  }
}
