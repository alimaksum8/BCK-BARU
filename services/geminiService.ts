
import { GoogleGenAI, Type } from "@google/genai";

const MODEL_NAME = "gemini-3-flash-preview";

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    // Check for 503, 429, or UNAVAILABLE status
    const isRetryable = error?.message?.includes('503') || 
                       error?.message?.includes('429') || 
                       error?.message?.includes('UNAVAILABLE') ||
                       error?.status === 503 ||
                       error?.status === 429;
    
    if (retries > 0 && isRetryable) {
      console.warn(`Gemini API busy (503/429), retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const suggestActivities = async (jabatan: string, schoolType: string) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const result = await withRetry(() => ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Suggest 5 common daily activities for a teacher with position "${jabatan}" at a "${schoolType}". Return the response in a structured JSON array of strings in Indonesian.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }));

    const text = result.text;
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error("Failed to suggest activities", e);
    return [];
  }
};

export interface ScanInput {
  fileBase64?: string;
  mimeType?: string;
  extractedText?: string;
}

export const scanCalendar = async (input: ScanInput) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const parts: any[] = [];
    
    if (input.fileBase64 && input.mimeType) {
      parts.push({
        inlineData: {
          data: input.fileBase64,
          mimeType: input.mimeType,
        },
      });
    }
    
    if (input.extractedText) {
      parts.push({
        text: `Data teks dari file Excel/Dokumen: \n${input.extractedText}`,
      });
    }
    
    parts.push({
      text: `Analisis data kalender pendidikan ini. Ekstrak daftar hari libur dan kegiatan penting. 
             PENTING: Jika ada rentang tanggal (contoh: Libur Semester Genap tgl 1 s/d 8 Juli), pecahlah menjadi entri tanggal tunggal yang terpisah (tgl 1, 2, 3, dst).
             Sertakan KODE kegiatan jika ditemukan (misal: LU, LHB, LBH, LPP, EF, dsb) di awal Nama Kegiatan (contoh: "LBH: Libur Semester").
             Kembalikan dalam format JSON array dengan struktur: [{"date": "YYYY-MM-DD", "name": "Nama Libur/Kegiatan"}].
             Pastikan format tanggal adalah YYYY-MM-DD.`,
    });

    const result = await withRetry(() => ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              name: { type: Type.STRING },
            },
            required: ["date", "name"],
          },
        },
      },
    }));

    const text = result.text;
    return text ? JSON.parse(text) : null;
  } catch (e) {
    console.error("Failed to scan calendar", e);
    return null;
  }
};

export const refineActivity = async (draft: string) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const result = await withRetry(() => ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Perbaiki dan buat kalimat yang lebih profesional untuk catatan kegiatan harian guru berikut: "${draft}". Gunakan bahasa Indonesia yang formal. Balas hanya dengan kalimat hasil perbaikan.`,
    }));

    return result.text?.trim() || draft;
  } catch (e) {
    console.error("Failed to refine activity", e);
    return draft;
  }
};


