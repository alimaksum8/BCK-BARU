
import { GoogleGenAI, Type } from "@google/genai";

export const suggestActivities = async (jabatan: string, schoolType: string) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.error("Gemini API Key is missing");
    throw new Error("API Key configuration error");
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest 5 common daily activities for a teacher with position "${jabatan}" at a "${schoolType}". Return the response in a structured JSON array of strings in Indonesian.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text;
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error("Failed to get suggestion from AI", e);
    throw e;
  }
};

export interface ScanInput {
  fileBase64?: string;
  mimeType?: string;
  extractedText?: string;
}

export const scanCalendar = async (input: ScanInput) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.error("Gemini API Key is missing");
    throw new Error("API Key configuration error");
  }

  const ai = new GoogleGenAI({ apiKey });
  
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
  
  if (parts.length === 0) {
    throw new Error("No input data provided for scanning");
  }

  parts.push({
    text: `Analisis data kalender pendidikan ini. Ekstrak daftar hari libur dan kegiatan penting. 
           PENTING: Jika ada rentang tanggal (contoh: Libur Semester Genap tgl 1 s/d 8 Juli), pecahlah menjadi entri tanggal tunggal yang terpisah (tgl 1, 2, 3, dst).
           Sertakan KODE kegiatan jika ditemukan (misal: LU, LHB, LBH, LPP, EF, dsb) di awal Nama Kegiatan (contoh: "LBH: Libur Semester").
           Kembalikan dalam format JSON array dengan struktur: [{"date": "YYYY-MM-DD", "name": "Nama Libur/Kegiatan"}].
           Pastikan format tanggal adalah YYYY-MM-DD.`,
  });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to scan calendar with AI", e);
    throw e;
  }
};

export const refineActivity = async (draft: string) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.error("Gemini API Key is missing");
    return draft;
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Perbaiki dan buat kalimat yang lebih profesional untuk catatan kegiatan harian guru berikut: "${draft}". Gunakan bahasa Indonesia yang formal. Balas hanya dengan kalimat hasil perbaikan.`,
    });

    return response.text?.trim() || draft;
  } catch (e) {
    console.error("Failed to refine activity", e);
    return draft;
  }
};
