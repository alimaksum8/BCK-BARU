
import { GoogleGenAI, Type } from "@google/genai";

export const suggestActivities = async (jabatan: string, schoolType: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

  try {
    const text = response.text;
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
};

export interface ScanInput {
  fileBase64?: string;
  mimeType?: string;
  extractedText?: string;
}

export const scanCalendar = async (input: ScanInput) => {
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

  try {
    const text = response.text;
    return text ? JSON.parse(text) : null;
  } catch (e) {
    console.error("Failed to parse calendar scan", e);
    return null;
  }
};

export const refineActivity = async (draft: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Perbaiki dan buat kalimat yang lebih profesional untuk catatan kegiatan harian guru berikut: "${draft}". Gunakan bahasa Indonesia yang formal. Balas hanya dengan kalimat hasil perbaikan.`,
  });

  return response.text?.trim() || draft;
};
