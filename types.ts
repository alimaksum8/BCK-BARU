
export interface Profile {
  name: string;
  nip?: string;
  nuptk: string;
  npk: string;
  pegId: string;
  jabatan: string;
  school: string;
  headmasterName: string;
  headmasterNip?: string;
  headmasterNuptk?: string;
  headmasterNpk?: string;
  headmasterPegId?: string;
  supervisorName?: string;
  supervisorNip?: string;
  location: string;
}

export interface Activity {
  id: string;
  date: string;
  description: string;
  quantity: string;
  isHoliday: boolean;
  subActivities?: { id: string; description: string; quantity: string }[];
}

export interface MonthlyLog {
  month: number;
  year: number;
  activities: Activity[];
}

export interface KaldikEvent {
  date: string; // YYYY-MM-DD
  name: string;
}
