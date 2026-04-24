
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Printer, 
  User, 
  FileText, 
  Settings as SettingsIcon, 
  Sparkles, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  Calendar as CalendarIcon,
  ArrowLeft,
  Database,
  Trash,
  Settings,
  RefreshCw,
  ScanSearch,
  MousePointerClick,
  LayoutDashboard,
  UserCheck,
  Users,
  Menu
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Profile, Activity, MonthlyLog, KaldikEvent } from './types';
import { suggestActivities, refineActivity, scanCalendar } from './services/geminiService';

const STORAGE_KEY_PROFILE = 'bck_profile';
const STORAGE_KEY_LOGS = 'bck_logs';
const STORAGE_KEY_KALDIK = 'bck_kaldik_data';
const STORAGE_KEY_DB = 'bck_activity_db';
const STORAGE_KEY_QTY_DB = 'bck_quantity_db';
const STORAGE_KEY_TEACHERS = 'bck_fingerprint_teachers';

const ActivityDbInput = ({ onAdd, placeholder = "Contoh: Mengoreksi hasil ulangan siswa..." }: { onAdd: (item: string) => void, placeholder?: string }) => {
  const [text, setText] = useState('');
  const handleAdd = () => {
    if (text.trim()) { onAdd(text.trim()); setText(''); }
  };
  return (
    <div className="flex gap-2 mb-6">
      <input className="flex-1 bg-gray-50 border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
      <button onClick={handleAdd} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition active:scale-95 flex items-center justify-center"><Plus size={24} /></button>
    </div>
  );
};

const FingerprintView: React.FC<{ profile: Profile, logs: MonthlyLog[], importedKaldik: KaldikEvent[], currentDate: Date, showToast: (msg: string, type: 'success' | 'error') => void }> = ({ profile, logs, importedKaldik, currentDate, showToast }) => {
  const [teachers, setTeachers] = useState<{ id: number; name: string; schedule: number[] }[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TEACHERS);
    return saved ? JSON.parse(saved) : [];
  });
  
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TEACHERS, JSON.stringify(teachers));
  }, [teachers]);

  // Initialize monthPicker from global currentDate
  const initialYear = currentDate.getFullYear();
  const initialMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');
  const [monthPicker, setMonthPicker] = useState(`${initialYear}-${initialMonth}`);

  const [MadrasahName, setMadrasahName] = useState('Madrasah Aliyah Negeri');
  const [teacherName, setTeacherName] = useState('');
  const [schedule, setSchedule] = useState({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
  const [isReportVisible, setIsReportVisible] = useState(false);
  const [isTeacherDbModalOpen, setIsTeacherDbModalOpen] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null);
  
  // New combined state for generated data to ensure consistency
  const [generatedReport, setGeneratedReport] = useState<{
    data: { [key: number]: { jd: string; jp: string; cls: string; hadir: boolean; shouldConsolidate: boolean; marker: string; isSunday: boolean; isHoliday: boolean }[] };
    month: number;
    year: number;
    monthName: string;
    madrasahName: string;
    daysCount: number;
  } | null>(null);

  const addOrUpdateTeacher = () => {
    if (!teacherName) {
      showToast("Nama guru tidak boleh kosong", "error");
      return;
    }
    const activeSchedule = Object.entries(schedule)
      .filter(([_, active]) => active)
      .map(([day, _]) => parseInt(day));
    
    if (activeSchedule.length === 0) {
      showToast("Minimal satu hari kerja harus dipilih", "error");
      return;
    }

    if (editingTeacherId) {
      setTeachers(teachers.map(t => t.id === editingTeacherId ? { ...t, name: teacherName, schedule: activeSchedule } : t));
      setEditingTeacherId(null);
      showToast("Data guru berhasil diperbarui", "success");
    } else {
      setTeachers([...teachers, { id: Date.now(), name: teacherName, schedule: activeSchedule }]);
      showToast("Guru berhasil ditambahkan", "success");
    }
    
    setTeacherName('');
    setSchedule({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
    setGeneratedReport(null); 
  };

  const removeTeacher = (id: number) => {
    if (confirm("Hapus data guru ini?")) {
      setTeachers(teachers.filter(t => t.id !== id));
      setGeneratedReport(null);
      showToast("Guru berhasil dihapus", "success");
    }
  };

  const startEditTeacher = (t: { id: number; name: string; schedule: number[] }) => {
    setEditingTeacherId(t.id);
    setTeacherName(t.name);
    const newSchedule = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false };
    t.schedule.forEach(day => {
      newSchedule[day as keyof typeof newSchedule] = true;
    });
    setSchedule(newSchedule);
  };

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();

  const generateRandomTime = (limitHour: number) => {
    const hour = limitHour - 1;
    const minute = Math.floor(Math.random() * 30) + 30;
    const second = Math.floor(Math.random() * 60);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  };

  const generateRandomTimeJP = (limitHour: number) => {
    // Range 13:00:30 to 13:50:17
    const startInSeconds = 30; // seconds into the hour
    const endInSeconds = 50 * 60 + 17; // 3017 seconds into the hour
    const randomSeconds = Math.floor(Math.random() * (endInSeconds - startInSeconds + 1)) + startInSeconds;
    const m = Math.floor(randomSeconds / 60);
    const s = randomSeconds % 60;
    return `13:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const [year, month] = monthPicker.split('-').map(Number);
  const monthName = new Date(year, month - 1).toLocaleString('id-ID', { month: 'long' });
  const daysCount = getDaysInMonth(month - 1, year);

  const getDayStatus = (d: number) => {
    const dayDate = new Date(year, month - 1, d);
    const dayIndex = dayDate.getDay();
    const monthIndex = month - 1;
    const dateId = `${year}-${monthIndex}-${d}`;
    const targetLog = logs.find(l => l.month === monthIndex && l.year === year);
    const activity = targetLog?.activities.find(a => a.id === dateId);
    
    const isSunday = dayIndex === 0;
    const standardDateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    const kaldikEvent = importedKaldik?.find(e => e.date === standardDateStr);

    const holidayCodes = ['LU', 'LHB', 'LHR', 'LH', 'LBH', 'LPP', 'M', 'LIBUR', 'LS'];
    
    // Extract potential marker first to check against holiday codes
    let extractedMarker = '';
    if (activity?.quantity) {
      extractedMarker = activity.quantity.toUpperCase();
    } else if (kaldikEvent) {
      const upperName = kaldikEvent.name.toUpperCase();
      // Expanded list of codes to search for in event names
      const knownCodes = ['LU', 'LBH', 'LPP', 'EF', 'LHB', 'LHR', 'LH', 'M', 'PTS', 'PAS', 'PAT', 'AN', 'KBM'];
      const codeFromList = knownCodes.find(c => upperName.startsWith(c));
      extractedMarker = codeFromList || (kaldikEvent.name.length <= 5 ? upperName : 'LU');
    }

    const isActuallyHoliday = isSunday || holidayCodes.some(code => extractedMarker.startsWith(code)) || (activity?.isHoliday === true && !['EF', 'PTS', 'PAS', 'PAT', 'AN', 'KBM'].some(active => extractedMarker.startsWith(active)));
    
    let marker = extractedMarker;
    if (!marker && isSunday) marker = 'M';
    if (!marker && isActuallyHoliday) marker = 'L';

    // Only consolidate if it's effectively a holiday (Sunday or Holiday Code)
    const shouldConsolidate = isActuallyHoliday;
    
    return { isSunday, isHoliday: isActuallyHoliday, shouldConsolidate, dayIndex, marker };
  };

  const handleGenerate = () => {
    if (teachers.length === 0) return;
    
    const [selYear, selMonth] = monthPicker.split('-').map(Number);
    const selMonthIndex = selMonth - 1;
    const selDaysCount = getDaysInMonth(selMonthIndex, selYear);
    const selMonthName = new Date(selYear, selMonthIndex).toLocaleString('id-ID', { month: 'long' });
    
    const newData: { [key: number]: any[] } = {};
    
    teachers.forEach(teacher => {
      const records = [];
      for (let d = 1; d <= selDaysCount; d++) {
        // Use a local helper logic that uses the selected month/year
        const dayDate = new Date(selYear, selMonthIndex, d);
        const dayIndex = dayDate.getDay();
        const dateId = `${selYear}-${selMonthIndex}-${d}`;
        const targetLog = logs.find(l => l.month === selMonthIndex && l.year === selYear);
        const activity = targetLog?.activities.find(a => a.id === dateId);
        
        const isSunday = dayIndex === 0;
        const standardDateStr = `${selYear}-${selMonth.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        const kaldikEvent = importedKaldik?.find(e => e.date === standardDateStr);
        const holidayCodes = ['LU', 'LHB', 'LHR', 'LH', 'LBH', 'LPP', 'M', 'LIBUR', 'LS'];
        
        let extractedMarker = '';
        if (activity?.quantity) {
          extractedMarker = activity.quantity.toUpperCase();
        } else if (kaldikEvent) {
          const upperName = kaldikEvent.name.toUpperCase();
          const knownCodes = ['LU', 'LBH', 'LPP', 'EF', 'LHB', 'LHR', 'LH', 'M', 'PTS', 'PAS', 'PAT', 'AN', 'KBM'];
          const codeFromList = knownCodes.find(c => upperName.startsWith(c));
          
          if (codeFromList) {
            extractedMarker = codeFromList;
          } else {
            // Check for keywords if no explicit code found
            const isHolidyKeyword = upperName.includes('LIBUR') || upperName.includes('CUTI') || upperName.includes('HARI RAYA');
            extractedMarker = isHolidyKeyword ? 'LU' : (kaldikEvent.name.length <= 5 ? upperName : '');
          }
        }

        const activeCodes = ['EF', 'PTS', 'PAS', 'PAT', 'AN', 'KBM'];
        const isActuallyHoliday = isSunday || 
          (holidayCodes.some(code => extractedMarker.startsWith(code)) && !activeCodes.some(active => extractedMarker.startsWith(active))) || 
          (activity?.isHoliday === true && !activeCodes.some(active => extractedMarker.startsWith(active)));
        
        let marker = extractedMarker;
        if (!marker && isSunday) marker = 'M';
        if (!marker && isActuallyHoliday && !marker) marker = 'L';
        
        const shouldConsolidate = isActuallyHoliday; 

        let jd = '-';
        let jp = '-';
        let cls = '';
        let hadir = false;

        if (isActuallyHoliday) {
          jd = marker; 
          jp = marker; 
          cls = 'bg-sunday';
        } else if (teacher.schedule.includes(dayIndex)) {
          jd = generateRandomTime(7);
          jp = generateRandomTimeJP(13);
          hadir = true;
        } else {
          cls = 'bg-off';
        }
        records.push({ jd, jp, cls, hadir, shouldConsolidate, marker, isSunday, isHoliday: isActuallyHoliday });
      }
      newData[teacher.id] = records;
    });
    
    setGeneratedReport({
      data: newData,
      month: selMonthIndex,
      year: selYear,
      monthName: selMonthName,
      madrasahName: MadrasahName,
      daysCount: selDaysCount
    });
  };

  const handlePrint = () => {
    if (!generatedReport) return;
    setIsReportVisible(true);
    setTimeout(() => {
      window.print();
      setIsReportVisible(false);
    }, 500);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
      <div className="max-w-4xl mx-auto mb-4 flex justify-start no-print">
        <button 
          onClick={() => setIsTeacherDbModalOpen(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 flex items-center gap-2"
        >
          <Database size={18} /> Data Base Guru
        </button>
      </div>

      <div className="max-w-4xl mx-auto bg-white p-6 rounded-3xl shadow-sm border border-gray-100 no-print mb-8">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-600">Sistem Absensi Fingerprint Madrasah</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Bulan & Tahun</label>
            <input 
              type="month" 
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition" 
              value={monthPicker}
              onChange={(e) => {
                setMonthPicker(e.target.value);
                setGeneratedReport(null); // Clear stale data on change
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Nama Madrasah</label>
            <input 
              type="text" 
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition" 
              placeholder="Nama Madrasah..." 
              value={MadrasahName}
              onChange={(e) => setMadrasahName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-6 bg-blue-50/50 rounded-3xl border border-blue-100 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600/10 text-blue-600 rounded-2xl flex items-center justify-center">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm font-black text-blue-900 uppercase tracking-wider">Status Guru</p>
              <p className="text-xs text-blue-600 font-bold">{teachers.length} Guru terdaftar di database</p>
            </div>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button 
              onClick={handleGenerate}
              className="flex-1 sm:flex-none bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 transition shadow-xl shadow-blue-200 flex items-center justify-center gap-2 uppercase tracking-widest text-xs active:scale-95"
            >
              <Sparkles size={18} /> Generate Data
            </button>
            {generatedReport && (
              <button 
                onClick={handlePrint}
                className="flex-1 sm:flex-none bg-green-500 text-white px-8 py-4 rounded-2xl font-black hover:bg-green-600 shadow-xl shadow-green-100 transition uppercase tracking-widest text-xs flex items-center justify-center gap-2 animate-in fade-in"
              >
                <Printer size={18} /> Cetak
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Teacher Database Modal */}
      {isTeacherDbModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-xl text-white">
                  <Database size={20} />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Data Base Guru</h3>
              </div>
              <button 
                onClick={() => {
                  setIsTeacherDbModalOpen(false);
                  setEditingTeacherId(null);
                  setTeacherName('');
                  setSchedule({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
                }}
                className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="bg-blue-50/50 p-6 rounded-3xl mb-8 border border-blue-100">
                <h4 className="font-bold text-blue-900 mb-4">{editingTeacherId ? 'Edit Data Guru' : 'Tambah Guru Baru'}</h4>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-blue-800 uppercase tracking-widest mb-2">Nama Lengkap</label>
                    <input 
                      type="text" 
                      placeholder="Nama Guru Lengkap..." 
                      className="w-full bg-white border border-blue-100 rounded-2xl p-4 focus:ring-2 focus:ring-blue-600 outline-none transition font-bold"
                      value={teacherName}
                      onChange={(e) => setTeacherName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-blue-800 uppercase tracking-widest mb-3">Hari Kerja Aktif</label>
                    <div className="flex flex-wrap gap-2">
                      {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((day, idx) => (
                        <label key={day} className={`flex-1 min-w-[80px] p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-center gap-2 ${schedule[(idx + 1) as keyof typeof schedule] ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-blue-100 text-blue-600 hover:border-blue-300'}`}>
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={schedule[(idx + 1) as keyof typeof schedule]} 
                            onChange={() => setSchedule({ ...schedule, [idx + 1]: !schedule[(idx + 1) as keyof typeof schedule] })} 
                          />
                          <span className="text-xs font-bold">{day}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={addOrUpdateTeacher}
                      className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black hover:bg-blue-700 transition shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                    >
                      {editingTeacherId ? 'Simpan Perubahan' : 'Simpan Data Guru'}
                    </button>
                    {editingTeacherId && (
                      <button 
                        onClick={() => {
                          setEditingTeacherId(null);
                          setTeacherName('');
                          setSchedule({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
                        }}
                        className="px-6 py-4 rounded-2xl font-bold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Daftar Guru ({teachers.length})</h4>
                {teachers.length === 0 ? (
                  <div className="py-12 text-center">
                    <Users size={48} className="mx-auto text-gray-200 mb-4" />
                    <p className="text-gray-400 font-medium italic">Belum ada guru yang terdaftar.</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {teachers.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-blue-100 transition-all group">
                        <div>
                          <p className="font-bold text-gray-800">{t.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">
                            Jadwal: {t.schedule.map(d => ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d-1]).join(', ')}
                          </p>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => startEditTeacher(t)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition"
                            title="Edit"
                          >
                            <Settings size={18} />
                          </button>
                          <button 
                            onClick={() => removeTeacher(t.id)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-xl transition"
                            title="Hapus"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {generatedReport && (
        <div className="max-w-[calc(100vw-40px)] mx-auto overflow-x-auto no-print bg-white p-8 rounded-3xl shadow-sm border border-gray-100 mb-8 animate-in slide-in-from-top-4 duration-500 custom-scrollbar">
          <div className="min-w-[1800px]">
            <div className="text-center mb-8 border-b border-dashed border-gray-100 pb-6">
              <h2 className="text-xl font-bold uppercase tracking-tight text-gray-900 transition-all">REKAPITULASI KEHADIRAN FINGERPRINT</h2>
              <h3 className="text-lg font-black uppercase text-blue-600 mt-1">{generatedReport.madrasahName}</h3>
              <p className="text-xs mt-2 text-gray-500 font-medium">Bulan: <span className="text-gray-900 font-bold">{generatedReport.monthName} {generatedReport.year}</span> | Jam Kerja: Datang <span className="text-gray-900 font-bold">&lt; 07:00:00</span>, Pulang <span className="text-gray-900 font-bold">&lt; 13:00:00</span></p>
            </div>
            
            <table className="min-w-full border-collapse border border-black" style={{ fontSize: '5pt' }}>
              <thead>
                <tr className="bg-gray-50 uppercase text-gray-700 font-bold">
                  <th rowSpan={2} className="border border-black p-0.5" style={{ width: '20pt' }}>No</th>
                  <th rowSpan={2} className="border border-black p-0.5 text-left" style={{ width: '90pt' }}>Nama Guru</th>
                  <th rowSpan={2} className="border border-black p-0.5" style={{ width: '35pt', fontSize: '4.5pt' }}>JM</th>
                  <th rowSpan={2} className="border border-black p-0.5" style={{ width: '35pt', fontSize: '4.5pt' }}>JP</th>
                  {Array.from({length: generatedReport.daysCount}, (_, i) => {
                    const record = Object.values(generatedReport.data)[0]?.[i];
                    const shouldConsolidate = record?.shouldConsolidate;
                    return (
                      <th 
                        key={i} 
                        rowSpan={shouldConsolidate ? 2 : 1} 
                        colSpan={shouldConsolidate ? 1 : 2} 
                        className="border border-black p-0.5" 
                        style={{ minWidth: shouldConsolidate ? '18pt' : '36pt' }}
                      >
                        {i+1}
                      </th>
                    );
                  })}
                  <th rowSpan={2} className="border border-black p-0.5" style={{ width: '15pt' }}>Hdr</th>
                </tr>
                <tr className="bg-gray-50 text-gray-500 font-black" style={{ fontSize: '6pt' }}>
                  {Array.from({length: generatedReport.daysCount}, (_, i) => {
                    const record = Object.values(generatedReport.data)[0]?.[i];
                    if (record?.shouldConsolidate) return null;
                    return (
                      <React.Fragment key={i}>
                        <th className="border border-black p-0.5 bg-gray-100/50" style={{ width: '18pt' }}>JD</th>
                        <th className="border border-black p-0.5 bg-gray-100/50" style={{ width: '18pt' }}>JP</th>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {teachers.map((t, idx) => {
                  const records = generatedReport.data[t.id] || [];
                  const hadirCount = records.filter(r => r.hadir).length;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition border-b border-black">
                      <td className="border border-black p-0.5 text-center">{idx + 1}</td>
                      <td className="border border-black p-0.5 font-bold uppercase">{t.name}</td>
                      <td className="border border-black p-0.5 text-center font-mono text-gray-400 italic" style={{ fontSize: '4.5pt' }}>07:00:00</td>
                      <td className="border border-black p-0.5 text-center font-mono text-gray-400 italic" style={{ fontSize: '4.5pt' }}>13:00:00</td>
                      {records.map((r, i) => {
                        if (r.shouldConsolidate) {
                          return <td key={i} className="border border-black p-0.5 text-center bg-red-50 text-red-600 font-bold" style={{ fontSize: '4.5pt', width: '18pt' }}>{r.jd}</td>;
                        }
                        return (
                          <React.Fragment key={i}>
                            <td className={`border border-black p-0.5 text-center font-mono ${r.cls === 'bg-off' ? 'bg-gray-50 text-gray-300' : (r.isSunday || r.isHoliday) ? 'bg-red-50 text-red-600 font-bold' : ''}`} style={{ fontSize: '4.5pt' }}>{r.jd}</td>
                            <td className={`border border-black p-0.5 text-center font-mono ${r.cls === 'bg-off' ? 'bg-gray-50 text-gray-300' : (r.isSunday || r.isHoliday) ? 'bg-red-50 text-red-600 font-bold' : ''}`} style={{ fontSize: '4.5pt' }}>{r.jp}</td>
                          </React.Fragment>
                        );
                      })}
                      <td className="border border-black p-0.5 font-bold bg-blue-50 text-blue-600 text-center">{hadirCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isReportVisible && generatedReport && (
        <div className="hidden print:block" id="print-area">
          <div className="print-content-wrapper">
            <div className="print-header">
              <h2 className="title-main">REKAPITULASI KEHADIRAN FINGERPRINT</h2>
              <h3 className="title-sub">{generatedReport.madrasahName}</h3>
              <p className="title-desc">Bulan: <strong>{generatedReport.monthName} {generatedReport.year}</strong> | Jam Kerja: Datang &lt; 07:00:00, Pulang &lt; 13:00:00</p>
            </div>

            <style>{`
              @media print {
                @page { 
                  size: landscape; 
                  margin: 1.0cm !important; 
                }
                * { 
                  box-sizing: border-box !important; 
                  -webkit-print-color-adjust: exact !important; 
                  print-color-adjust: exact !important;
                }
                body { 
                  margin: 0 !important; 
                  padding: 0 !important; 
                  background: white !important; 
                  font-family: Arial, Helvetica, sans-serif !important;
                  width: 100% !important;
                }
                #print-area { 
                  width: 100% !important; 
                  margin: 0 !important; 
                  padding: 0 !important; 
                  display: block !important;
                }
                .print-content-wrapper { 
                  width: 100% !important; 
                  margin: 0 auto !important; 
                  padding: 0 !important; 
                  display: block !important;
                }
                .print-header { 
                  width: 100% !important; 
                  margin: 0 0 25pt 0 !important; 
                  text-align: center !important; 
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .print-header h2.title-main { 
                  font-size: 16pt !important; 
                  font-weight: 800 !important; 
                  text-transform: uppercase !important;
                  margin: 0 0 5pt 0 !important; 
                  padding: 0 !important;
                  width: 100% !important;
                  text-align: center !important;
                }
                .print-header h3.title-sub { 
                  font-size: 13pt !important; 
                  font-weight: 700 !important; 
                  text-transform: uppercase !important;
                  color: #111827 !important;
                  margin: 0 0 8pt 0 !important; 
                  padding: 0 !important;
                  width: 100% !important;
                  text-align: center !important;
                }
                .print-header p.title-desc { 
                  font-size: 10pt !important; 
                  font-style: italic !important;
                  margin: 0 !important; 
                  padding: 0 !important;
                  width: 100% !important;
                  text-align: center !important;
                  color: #374151 !important;
                }
                table { 
                  border-collapse: collapse !important; 
                  width: 100% !important; 
                  border: 1pt solid black !important; 
                  margin: 0 auto !important; 
                  table-layout: fixed !important; 
                }
                th, td { 
                  border: 0.5pt solid black !important; 
                  padding: 2px 0 !important; 
                  font-size: 5.5pt !important; 
                  text-align: center !important; 
                  overflow: hidden !important; 
                  vertical-align: middle !important; 
                  white-space: nowrap !important;
                }
                th { 
                  background-color: #f3f4f6 !important; 
                  font-weight: bold !important; 
                  font-size: 5pt !important;
                }
                .bg-sunday { background-color: #fee2e2 !important; color: #dc2626 !important; font-weight: bold !important; }
                .text-late { color: #dc2626 !important; font-weight: bold !important; }
                .text-absent { font-weight: bold !important; color: #dc2626 !important; }
                
                .signature-section {
                  margin-top: 40pt !important;
                  width: 100% !important;
                  display: flex !important;
                  flex-direction: row !important;
                  justify-content: space-between !important;
                  padding: 0 50pt !important;
                  page-break-inside: avoid !important;
                }
                .sig-box {
                  text-align: center !important;
                  width: 200pt !important;
                }
                .sig-box p { margin: 2pt 0 !important; font-size: 10pt !important; }
                .sig-name { margin-top: 55pt !important; font-weight: bold !important; text-decoration: underline !important; text-transform: uppercase !important; font-size: 10.5pt !important; }
                .sig-nip { font-size: 9.5pt !important; }
              }
            `}</style>

            <table className="w-full">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: '25pt' }}>No</th>
                  <th rowSpan={2} style={{ width: '130pt' }}>Nama Guru / Pegawai</th>
                  <th rowSpan={2} style={{ width: '38pt' }}>Ref. JM</th>
                  <th rowSpan={2} style={{ width: '38pt' }}>Ref. JP</th>
                  {Array.from({length: generatedReport.daysCount}).map((_, i) => (
                    <th key={i} colSpan={2} style={{ width: '26pt' }}>{i + 1}</th>
                  ))}
                  <th rowSpan={2} style={{ width: '22pt' }}>Hdr</th>
                  <th rowSpan={2} style={{ width: '22pt' }}>Ijn</th>
                  <th rowSpan={2} style={{ width: '22pt' }}>Alp</th>
                </tr>
                <tr>
                  {Array.from({length: generatedReport.daysCount}).map((_, i) => (
                    <React.Fragment key={i}>
                      <th style={{ fontSize: '3.5pt' }}>JD</th>
                      <th style={{ fontSize: '3.5pt' }}>JP</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher, idx) => {
                  const teacherLogs = generatedReport.data[teacher.id] || [];
                  const presentCount = teacherLogs.filter(l => l.hadir).length;
                  return (
                    <tr key={teacher.id}>
                      <td>{idx + 1}</td>
                      <td style={{ textAlign: 'left', paddingLeft: '4px', fontSize: '7.5pt', fontWeight: 'bold' }}>{teacher.name}</td>
                      <td style={{ color: '#059669', fontWeight: '800' }}>07:00:00</td>
                      <td style={{ color: '#2563eb', fontWeight: '800' }}>13:00:00</td>
                      {teacherLogs.map((log, i) => (
                        <React.Fragment key={i}>
                          <td className={log.cls}>{log.jd}</td>
                          <td className={log.cls}>{log.jp}</td>
                        </React.Fragment>
                      ))}
                      <td style={{ fontWeight: 'bold' }}>{presentCount}</td>
                      <td>0</td>
                      <td>0</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="signature-section">
              <div className="sig-box">
                <p>Mengetahui,</p>
                <p className="font-bold">Pengawas Madrasah</p>
                <div className="sig-name">{profile.supervisorName || '..........................................'}</div>
                <p className="sig-nip">NIP. {profile.supervisorNip || '..........................................'}</p>
              </div>
              <div className="sig-box">
                <p>Ditetapkan di: {profile.location || '....................'}</p>
                <p className="font-bold">Kepala Madrasah</p>
                <div className="sig-name">{profile.headmasterName || '..........................................'}</div>
                <p className="sig-nip">NIP. {profile.headmasterNip || '..........................................'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const KaldikView: React.FC<{
  importedKaldik: KaldikEvent[];
  setImportedKaldik: (events: KaldikEvent[]) => void;
  applyKaldikToLogs: () => void;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setView: (view: any) => void;
  showToast: (msg: string, type: any) => void;
}> = ({ 
  importedKaldik, 
  setImportedKaldik, 
  applyKaldikToLogs, 
  handleFileUpload, 
  fileInputRef, 
  setView, 
  showToast 
}) => {
  // Group events by year and month
  const groupedKaldik = importedKaldik.reduce((acc, event) => {
    const [y, m] = event.date.split('-');
    const key = `${y}-${m}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {} as Record<string, KaldikEvent[]>);

  // Sort months
  const sortedMonthKeys = Object.keys(groupedKaldik).sort();

  const [newEventDate, setNewEventDate] = useState('');
  const [newEventName, setNewEventName] = useState('');

  const handleAddManual = () => {
    if (!newEventDate || !newEventName) return;
    setImportedKaldik([...importedKaldik, { date: newEventDate, name: newEventName }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewEventDate('');
    setNewEventName('');
    showToast("Event ditambahkan", "success");
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between mb-8 no-print">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-gray-400 hover:text-blue-600 font-medium transition-colors"><ArrowLeft size={20} /><span>Kembali</span></button>
        <div className="text-right">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">KALENDER PENDIDIKAN</h2>
          <p className="text-xs font-bold text-blue-600">PREVIEW & MANAJEMEN DATA</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        <div className="xl:col-span-1 space-y-6 no-print">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 ring-1 ring-black/5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Upload size={18} className="text-blue-600" />Impor Dokumen</h3>
            <p className="text-[10px] leading-relaxed text-gray-400 mb-4">AI akan memindai tabel Kaldik dan mengekstrak kode libur (LBH, LU, dll) secara otomatis.</p>
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.xlsx,.jpg,.png" onChange={handleFileUpload}/>
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl transition-all font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-100 hover:scale-[1.02] active:scale-95">
              <Upload size={20} /><span>Pilih File</span>
            </button>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 ring-1 ring-black/5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus size={18} className="text-blue-600" />Tambah Manual</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Tanggal</label>
                <input 
                  type="date" 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Keterangan</label>
                <input 
                  type="text" 
                  placeholder="Contoh: LBH: Libur Semester" 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                />
              </div>
              <button 
                onClick={handleAddManual}
                className="w-full bg-gray-900 text-white hover:bg-black py-4 rounded-xl transition-all font-bold text-xs mt-2 flex items-center justify-center gap-2"
              >
                <Plus size={16} /><span>Simpan ke Tabel</span>
              </button>
            </div>
          </div>

          {importedKaldik.length > 0 && (
            <div className="space-y-3 pt-2">
              <button onClick={applyKaldikToLogs} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold shadow-xl shadow-indigo-100 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2">
                <CheckCircle2 size={20} /><span>Terapkan ke Absensi</span>
              </button>
              <button onClick={() => { if(confirm("Hapus semua data kaldik?")) setImportedKaldik([]); }} className="w-full text-red-500 hover:text-red-700 py-2 font-bold transition text-[10px] uppercase tracking-widest text-center">
                Bersihkan Data
              </button>
            </div>
          )}
        </div>

        <div className="xl:col-span-3">
          {importedKaldik.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-sm border-2 border-dashed border-gray-100 p-20 text-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <ScanSearch size={40} className="text-gray-200" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Belum Ada Data Terdeteksi</h3>
              <p className="text-sm text-gray-400 max-w-xs mx-auto mt-2 font-medium">Impor dokumen Kalender Pendidikan Anda untuk menampilkan tabel preview di sini.</p>
            </div>
          ) : (
            <div className="space-y-10 mb-20">
              {sortedMonthKeys.map(key => {
                const [y, m] = key.split('-');
                const dObj = new Date(parseInt(y), parseInt(m) - 1);
                const monthName = dObj.toLocaleString('id-ID', { month: 'long' });
                const yearName = dObj.getFullYear();
                const events = groupedKaldik[key].sort((a,b) => a.date.localeCompare(b.date));
                
                return (
                  <div key={key} className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden ring-1 ring-black/[0.02]">
                    <div className="bg-gray-900 px-8 py-5 flex items-center justify-between">
                      <div>
                        <h3 className="font-black text-white text-lg tracking-tight uppercase">{monthName}</h3>
                        <p className="text-[10px] text-blue-400 font-bold tracking-[0.2em]">{yearName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-white/10 text-white/50 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                          {events.length} TOTAL
                        </span>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-50/50 border-b border-gray-100">
                            <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-24">Tgl</th>
                            <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-24">Hari</th>
                            <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-32">Keterangan</th>
                            <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Deskripsi Agenda Pendidikan / Libur Nasional</th>
                            <th className="px-8 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest no-print w-20">Operasi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {events.map((event, eIdx) => {
                            const d = new Date(event.date);
                            const day = d.getDate();
                            const dayName = d.toLocaleString('id-ID', { weekday: 'long' });
                            
                            // Extract code
                            const commonCodes = ['LU', 'LBH', 'LPP', 'EF', 'LHB', 'LHR', 'LH', 'M'];
                            const upperName = event.name.toUpperCase();
                            const foundCode = commonCodes.find(code => upperName.startsWith(code));
                            const code = foundCode || (event.name.length <= 5 ? event.name.toUpperCase() : 'LU');
                            const cleanName = event.name.replace(new RegExp(`^${code}[:\s-]*`, 'i'), '');
                            
                            return (
                              <tr key={eIdx} className="hover:bg-blue-50/20 transition-colors group">
                                <td className="px-8 py-5 whitespace-nowrap">
                                  <span className="font-mono font-bold text-gray-900 text-lg">
                                    {day.toString().padStart(2, '0')}
                                  </span>
                                </td>
                                <td className="px-8 py-5 whitespace-nowrap">
                                  <span className="text-[11px] font-black text-gray-400 uppercase tracking-wide">
                                    {dayName}
                                  </span>
                                </td>
                                <td className="px-8 py-5 whitespace-nowrap">
                                  <div className={`px-3 py-1 rounded-lg text-[10px] font-black border text-center inline-block w-full
                                    ${code === 'LU' ? 'bg-red-50 text-red-600 border-red-100' : 
                                      code === 'LBH' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                      'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                    {code}
                                  </div>
                                </td>
                                <td className="px-8 py-5">
                                  <span className="text-sm font-bold text-gray-800 line-clamp-1 group-hover:line-clamp-none transition-all">
                                    {cleanName || event.name}
                                  </span>
                                </td>
                                <td className="px-8 py-5 text-right no-print">
                                  <button 
                                    onClick={() => setImportedKaldik(importedKaldik.filter((v) => v.date !== event.date || v.name !== event.name))}
                                    className="text-gray-200 hover:text-red-500 transition-all p-2 rounded-xl hover:bg-red-50"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'bck-guru' | 'bck-kepala' | 'kaldik' | 'absen-finger' | 'settings'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | null }>({ message: '', type: null });
  
  const [profile, setProfile] = useState<Profile>({
    name: 'ALI MAKSUM, S.Pd.I', 
    nip: '19780512 200501 1 002',
    nuptk: '3641766668110012', 
    npk: '7880990033017', 
    pegId: '91000088102370', 
    jabatan: "Guru Mata Pelajaran Qur'an Hadits", 
    school: 'MTsS Darul Huda', 
    headmasterName: 'SALAMET MOLYONO, S.Pd', 
    headmasterNip: '19740210 200312 1 001',
    headmasterNuptk: '2445762664200013',
    headmasterNpk: '7845430031091',
    headmasterPegId: '91000084163150',
    supervisorName: 'H. MASYHURI, S.Ag', 
    supervisorNip: '19680315 199403 1 005',
    location: 'Bondowoso',
  });

  const [currentDate, setCurrentDate] = useState(new Date());
  const [logs, setLogs] = useState<MonthlyLog[]>([]);
  const [importedKaldik, setImportedKaldik] = useState<KaldikEvent[]>([]);
  const [activityDb, setActivityDb] = useState<string[]>([]);
  const [quantityDb, setQuantityDb] = useState<string[]>(['1 Kegiatan', '2 Kegiatan', '3 Kegiatan', '4 Kegiatan']);
  const [openDbRowId, setOpenDbRowId] = useState<string | null>(null);
  const [openQtyRowId, setOpenQtyRowId] = useState<string | null>(null);
  // Track context for database selection (to know if we are updating a parent row or sub-row)
  const [dbSelectionContext, setDbSelectionContext] = useState<{ parentId: string, subId?: string } | null>(null);
  
  const [editProfileType, setEditProfileType] = useState<'guru' | 'kepala' | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: null }), 3000);
  };

  // Initial local load
  useEffect(() => {
    const savedProfile = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      setProfile(prev => ({ ...prev, ...parsed }));
    }
    const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
    if (savedLogs) setLogs(JSON.parse(savedLogs));
    const savedKaldik = localStorage.getItem(STORAGE_KEY_KALDIK);
    if (savedKaldik) setImportedKaldik(JSON.parse(savedKaldik));
    const savedDb = localStorage.getItem(STORAGE_KEY_DB);
    if (savedDb) setActivityDb(JSON.parse(savedDb));
    const savedQtyDb = localStorage.getItem(STORAGE_KEY_QTY_DB);
    if (savedQtyDb) setQuantityDb(JSON.parse(savedQtyDb));
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_KALDIK, JSON.stringify(importedKaldik));
  }, [importedKaldik]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DB, JSON.stringify(activityDb));
  }, [activityDb]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_QTY_DB, JSON.stringify(quantityDb));
  }, [quantityDb]);

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();

  const getLogForCurrentMonth = useCallback(() => {
    let log = logs.find(l => l.month === currentMonth && l.year === currentYear);
    if (!log) {
      const days = getDaysInMonth(currentMonth, currentYear);
      const activities: Activity[] = [];
      for (let i = 1; i <= days; i++) {
        const date = new Date(currentYear, currentMonth, i);
        const isSunday = date.getDay() === 0;
        const standardDateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        const kaldikEvent = importedKaldik.find(e => e.date === standardDateStr);
        let qty = '';
        if (isSunday) {
          qty = 'M';
        } else if (kaldikEvent) {
          const commonCodes = ['LU', 'LBH', 'LPP', 'EF', 'LHB', 'LHR', 'LH', 'M'];
          const upperName = kaldikEvent.name.toUpperCase();
          const foundCode = commonCodes.find(code => upperName.startsWith(code));
          qty = foundCode || (kaldikEvent.name.length <= 4 ? kaldikEvent.name.toUpperCase() : 'LU');
        }

        activities.push({
          id: `${currentYear}-${currentMonth}-${i}`,
          date: date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          description: kaldikEvent ? kaldikEvent.name : (isSunday ? 'Minggu' : ''),
          quantity: qty,
          isHoliday: isSunday || !!kaldikEvent
        });
      }
      log = { month: currentMonth, year: currentYear, activities };
    }
    return log;
  }, [logs, currentMonth, currentYear, importedKaldik]);

  const currentLog = getLogForCurrentMonth();

  const detectQuantity = (description: string): string => {
    if (!description || description.trim() === '' || description.trim() === 'Minggu' || description.trim() === 'LU') return '';
    
    const cleanText = description.toLowerCase();
    
    // Pattern 1: Deteksi angka Romawi (I-XII) menggunakan regex word boundaries
    // Kita cari semua kemunculan angka romawi yang berdiri sendiri
    const romanRegex = /\b(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/g;
    const romanMatches = cleanText.match(romanRegex) || [];
    
    // Kita hitung jumlah angka romawi unik untuk menghindari over-counting jika angka yang sama disebut berulang kali
    // Namun untuk kelas (misal VII dan IX), mereka pasti unik.
    const uniqueRomans = new Set(romanMatches);
    const romanCount = uniqueRomans.size;

    // Pattern 2: Deteksi pemisah kegiatan (Indonesian Conjunctions)
    // "dan", "serta", "dan juga", ",", ";", "/", "maupun"
    const separatorRegex = / dan | serta | maupun | dan juga | dan\/atau |[,;/]/gi;
    const segments = description.split(separatorRegex)
      .map(s => s.trim())
      .filter(s => s.length > 3); // Minimal 4 karakter untuk dianggap satu "kegiatan" yang valid
    
    const countBySeparators = segments.length;

    // Logika Final:
    // Jika ada angka romawi (biasanya menandakan kelas yang berbeda), pakai hitungan romawi.
    // Jika tidak ada romawi, pakai hitungan pemisah konjungsi.
    let finalCount = 1;
    
    if (romanCount > 1) {
      finalCount = romanCount;
    } else if (countBySeparators > 1) {
      finalCount = countBySeparators;
    }

    return `${finalCount} Kegiatan`;
  };

  const updateActivity = (id: string, updates: Partial<Activity>) => {
    const newLogs = [...logs];
    const logIndex = newLogs.findIndex(l => l.month === currentMonth && l.year === currentYear);
    let updatedLog: MonthlyLog;

    if (logIndex === -1) {
      updatedLog = { ...currentLog };
    } else {
      updatedLog = { ...newLogs[logIndex] };
    }

    const targetActivity = updatedLog.activities.find(a => a.id === id);
    if (!targetActivity) return;

    // OTOMATISASI KUANTITAS: Jika deskripsi berubah tapi kuantitas tidak dikirim secara manual, 
    // deteksi kuantitas berdasarkan teks deskripsi.
    const effectiveUpdates = { ...updates };
    if (updates.description !== undefined && updates.quantity === undefined) {
      effectiveUpdates.quantity = detectQuantity(updates.description);
    }

    updatedLog.activities = updatedLog.activities.map(a => a.id === id ? { ...a, ...effectiveUpdates } : a);

    if (updates.description !== undefined && updates.description !== '') {
      const prevDescription = targetActivity.description;
      const [y, m, d] = id.split('-').map(Number);
      const dateObj = new Date(y, m, d);
      const dayOfWeek = dateObj.getDay();

      let fillCount = 0;
      const detectedQty = effectiveUpdates.quantity || '1 Kegiatan';

      updatedLog.activities = updatedLog.activities.map(a => {
        const [ay, am, ad] = a.id.split('-').map(Number);
        const aDate = new Date(ay, am, ad);
        
        // Update if the target day matches the same day of week in subsequent weeks
        // AND it's not a holiday
        // AND it's either currently empty OR it matches what the current row was before this update
        if (ad > d && aDate.getDay() === dayOfWeek && !a.isHoliday && (a.description === '' || a.description === prevDescription)) {
          fillCount++;
          return { ...a, description: updates.description || '', quantity: detectedQty };
        }
        return a;
      });

      // Show toast only when starting to fill for the first time or if many rows changed
      if (fillCount > 0 && prevDescription === '') {
        showToast(`Jadwal mingguan otomatis terisi (${fillCount} baris)`, "success");
      }
    }

    // Save state
    if (logIndex === -1) {
      newLogs.push(updatedLog);
    } else {
      newLogs[logIndex] = updatedLog;
    }
    setLogs(newLogs);
  };

  const addSubActivity = (parentId: string) => {
    const newLogs = [...logs];
    const logIndex = newLogs.findIndex(l => l.month === currentMonth && l.year === currentYear);
    const targetLog = logIndex === -1 ? { ...currentLog } : { ...newLogs[logIndex] };
    
    targetLog.activities = targetLog.activities.map(a => {
      if (a.id === parentId) {
        const subs = a.subActivities || [];
        return {
          ...a,
          subActivities: [...subs, { id: `${parentId}-sub-${Date.now()}`, description: '', quantity: '1 Kegiatan' }]
        };
      }
      return a;
    });

    if (logIndex === -1) newLogs.push(targetLog);
    else newLogs[logIndex] = targetLog;
    setLogs(newLogs);
  };

  const removeSubActivity = (parentId: string, subId: string) => {
    const newLogs = [...logs];
    const logIndex = newLogs.findIndex(l => l.month === currentMonth && l.year === currentYear);
    if (logIndex === -1) return;
    
    newLogs[logIndex].activities = newLogs[logIndex].activities.map(a => {
      if (a.id === parentId) {
        return {
          ...a,
          subActivities: (a.subActivities || []).filter(s => s.id !== subId)
        };
      }
      return a;
    });
    setLogs(newLogs);
  };

  const updateSubActivity = (parentId: string, subId: string, updates: { description?: string, quantity?: string }) => {
    const newLogs = [...logs];
    const logIndex = newLogs.findIndex(l => l.month === currentMonth && l.year === currentYear);
    if (logIndex === -1) return;
    
    newLogs[logIndex].activities = newLogs[logIndex].activities.map(a => {
      if (a.id === parentId) {
        return {
          ...a,
          subActivities: (a.subActivities || []).map(s => {
            if (s.id === subId) {
              const newS = { ...s, ...updates };
              if (updates.description !== undefined && updates.quantity === undefined) {
                newS.quantity = detectQuantity(updates.description);
              }
              return newS;
            }
            return s;
          })
        };
      }
      return a;
    });
    setLogs(newLogs);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    try {
      if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
          const results = await scanCalendar({ extractedText: csvText });
          if (results) {
            const sorted = results.sort((a: any, b: any) => a.date.localeCompare(b.date));
            setImportedKaldik(sorted);
            showToast("Kaldik diimpor", "success");
          }
          setIsScanning(false);
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          const results = await scanCalendar({ fileBase64: base64, mimeType: file.type });
          if (results) {
            const sorted = results.sort((a: any, b: any) => a.date.localeCompare(b.date));
            setImportedKaldik(sorted);
            showToast("Kaldik diproses", "success");
          }
          setIsScanning(false);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) { 
      setIsScanning(false); 
      showToast("Gagal memproses", "error");
    }
  };

  const applyKaldikToLogs = () => {
    if (importedKaldik.length === 0) return;
    const newLogs = [...logs];
    importedKaldik.forEach(event => {
      const [y, m, d] = event.date.split('-').map(Number);
      const monthIndex = m - 1;
      const dateId = `${y}-${monthIndex}-${d}`;
      let targetLog = newLogs.find(l => l.month === monthIndex && l.year === y);
      if (!targetLog) {
          const daysCount = getDaysInMonth(monthIndex, y);
          const entries: Activity[] = [];
          for (let i = 1; i <= daysCount; i++) {
            const iterDate = new Date(y, monthIndex, i);
            const isSun = iterDate.getDay() === 0;
            entries.push({
              id: `${y}-${monthIndex}-${i}`, 
              date: iterDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 
              description: isSun ? 'Minggu' : '', 
              quantity: isSun ? 'M' : '', 
              isHoliday: isSun
            });
          }
          targetLog = { month: monthIndex, year: y, activities: entries };
          newLogs.push(targetLog);
      }

      // Extract code if present at beginning (e.g. "LBH: Libur..." -> "LBH")
      let detectedQty = 'LU';
      const knownCodes = ['LU', 'LBH', 'LPP', 'EF', 'LHB', 'LHR', 'LH', 'M', 'PTS', 'PAS', 'PAT', 'AN', 'KBM'];
      const upperName = event.name.toUpperCase();
      
      const foundCode = knownCodes.find(code => upperName.startsWith(code));
      if (foundCode) {
        detectedQty = foundCode;
      } else if (event.name.length <= 4) {
        detectedQty = event.name.toUpperCase();
      }

      // Check if this code belongs to holiday category
      const holidayCodes = ['LU', 'LHB', 'LHR', 'LH', 'LBH', 'LPP', 'M', 'LIBUR', 'LS'];
      const isHoliday = holidayCodes.some(code => detectedQty.startsWith(code));

      targetLog.activities = targetLog.activities.map(a => (a.id === dateId) ? { ...a, description: event.name, isHoliday: isHoliday, quantity: detectedQty } : a);
    });
    setLogs(newLogs);
    setView('bck-guru');
    showToast("Kaldik diterapkan", "success");
  };

  const copySql = () => {
    navigator.clipboard.writeText(SQL_FIX_SCRIPT);
    alert("Script SQL perbaikan berhasil disalin! Silakan jalankan di Supabase SQL Editor.");
  };

  const DashboardView = () => (
    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Guru Identity */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 rounded-3xl text-white shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/20 rounded-lg"><User size={24}/></div>
            <h3 className="font-bold">Identitas Guru</h3>
          </div>
          <p className="text-xl font-bold truncate">{profile.name}</p>
          <div className="mt-2 space-y-0.5">
            <p className="text-[10px] opacity-70 leading-tight">NUPTK: {profile.nuptk}</p>
            <p className="text-[10px] opacity-70 leading-tight">NPK: {profile.npk}</p>
            <p className="text-[10px] opacity-70 leading-tight">PEG.ID: {profile.pegId}</p>
          </div>
          <button onClick={() => setEditProfileType('guru')} className="mt-4 text-xs bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full transition font-semibold">Edit Profil</button>
        </div>

        {/* Headmaster Identity */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-6 rounded-3xl text-white shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/20 rounded-lg"><Users size={24}/></div>
            <h3 className="font-bold">Identitas Kepala</h3>
          </div>
          <p className="text-xl font-bold truncate">{profile.headmasterName}</p>
          <div className="mt-2 space-y-0.5">
            <p className="text-[10px] opacity-70 leading-tight">NUPTK: {profile.headmasterNuptk || '-'}</p>
            <p className="text-[10px] opacity-70 leading-tight">NPK: {profile.headmasterNpk || '-'}</p>
            <p className="text-[10px] opacity-70 leading-tight">PEG.ID: {profile.headmasterPegId || '-'}</p>
          </div>
          <button onClick={() => setEditProfileType('kepala')} className="mt-4 text-xs bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full transition font-semibold">Edit Profil</button>
        </div>

        {/* Stats Card */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-500 text-sm font-bold mb-2">Total Jam Bulan Ini</h3>
          <p className="text-4xl font-black text-gray-800">{currentLog.activities.filter(a => a.description && !a.isHoliday).length * 1} <span className="text-lg font-normal text-gray-400">Kegiatan</span></p>
          <div className="mt-4 w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div className="bg-green-500 h-full" style={{ width: `${Math.min(100, (currentLog.activities.filter(a => a.description && !a.isHoliday).length / 25) * 100)}%` }}></div>
          </div>
        </div>

        {/* Quick Action Card */}
        <div className="bg-slate-800 p-6 rounded-3xl text-white shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm mb-1">Mulai Mencatat?</h3>
            <p className="text-xs opacity-80">Gunakan AI untuk ide kegiatan harian Anda.</p>
          </div>
          <button onClick={() => setView('bck-guru')} className="bg-white text-slate-800 px-4 py-2 rounded-xl text-xs font-bold w-fit mt-4">Buka BCK Guru</button>
        </div>
      </div>
      
      {editProfileType && (
        <div className="mb-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 no-print animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <User className={editProfileType === 'guru' ? 'text-blue-600' : 'text-indigo-600'} /> 
              Pengaturan Profil {editProfileType === 'guru' ? 'Guru' : 'Kepala'}
            </h2>
            <button onClick={() => setEditProfileType(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(profile).filter(key => {
              if (editProfileType === 'guru') {
                return ['name', 'nip', 'nuptk', 'npk', 'pegId', 'jabatan'].includes(key);
              } else {
                return ['headmasterName', 'headmasterNip', 'headmasterNuptk', 'headmasterNpk', 'headmasterPegId', 'supervisorName', 'supervisorNip', 'school', 'location'].includes(key);
              }
            }).map((key) => {
              const label = key === 'headmasterName' ? 'Nama Kepala Madrasah' : 
                          key === 'headmasterNip' ? 'NIP Kepala Madrasah' :
                          key === 'headmasterNuptk' ? 'NUPTK Kepala Madrasah' :
                          key === 'headmasterNpk' ? 'NPK Kepala Madrasah' :
                          key === 'headmasterPegId' ? 'Peg.ID Kepala Madrasah' :
                          key === 'supervisorName' ? 'Nama Pengawas Madrasah' :
                          key === 'supervisorNip' ? 'NIP Pengawas Madrasah' :
                          key === 'name' ? 'Nama Guru' :
                          key === 'nip' ? 'NIP Guru' :
                          key.replace(/([A-Z])/g, ' $1').trim();
              return (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">{label}</label>
                  <input className="w-full bg-gray-50 border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={(profile as any)[key] || ''} onChange={e => setProfile({...profile, [key as keyof Profile]: e.target.value})}/>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={() => setEditProfileType(null)} className="bg-gray-800 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-black transition">Selesai</button>
          </div>
        </div>
      )}
    </div>
  );

  const BCKLogView = ({ type }: { type: 'guru' | 'kepala' }) => (
    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3">
             <h2 className="text-2xl font-bold text-gray-800">{type === 'guru' ? 'BCK Guru' : 'BCK Kepala'}</h2>
             <div className="flex items-center bg-white border border-gray-200 rounded-2xl p-1 shadow-sm ml-4">
                <button onClick={() => setCurrentDate(new Date(currentYear, currentMonth - 1, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition"><ChevronLeft size={20} /></button>
                <div className="px-6 font-bold text-gray-700 capitalize">{currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</div>
                <button onClick={() => setCurrentDate(new Date(currentYear, currentMonth + 1, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition"><ChevronRight size={20} /></button>
             </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex items-center space-x-2 bg-gray-800 text-white px-5 py-2.5 rounded-xl shadow-md hover:bg-black transition">
              <Printer size={18} /><span>Cetak PDF</span>
            </button>
            <button onClick={async () => { setAiLoading(true); const ideas = await suggestActivities(profile.jabatan, profile.school); if (ideas) setSuggestions(ideas); setAiLoading(false); }} disabled={aiLoading} className="flex items-center space-x-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition disabled:opacity-50">
              <Sparkles size={18} /><span>{aiLoading ? 'Berpikir...' : 'Ide AI'}</span>
            </button>
          </div>
        </div>
        {(suggestions.length > 0 || activityDb.length > 0) && (
          <div className="mb-6 p-4 bg-white border border-gray-200 rounded-2xl no-print shadow-sm animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-600">Quick-Pick:</span>
                <span className="text-[10px] text-gray-400 font-medium">Auto-fill mingguan aktif saat baris diisi.</span>
              </div>
              <button onClick={() => setSuggestions([])} className="text-gray-400 hover:text-gray-600 text-sm"><X size={16}/></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, idx) => (
                <button key={`ai-${idx}`} onClick={() => { const empty = currentLog.activities.find(a => !a.description && !a.isHoliday); if (empty) updateActivity(empty.id, { description: s, quantity: '1 Kegiatan' }); }} className="bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full text-xs text-indigo-600 hover:bg-indigo-600 hover:text-white transition flex items-center gap-1"><Sparkles size={10}/> {s}</button>
              ))}
              {activityDb.map((s, idx) => (
                <button key={`db-${idx}`} onClick={() => { const empty = currentLog.activities.find(a => !a.description && !a.isHoliday); if (empty) updateActivity(empty.id, { description: s, quantity: '1 Kegiatan' }); }} className="bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full text-xs text-blue-600 hover:bg-blue-600 hover:text-white transition flex items-center gap-1"><Database size={10}/> {s}</button>
              ))}
            </div>
          </div>
        )}
        <div id="bck-print-area" className="bg-white shadow-2xl rounded-sm p-4 sm:p-6 border border-gray-200 overflow-visible min-w-full print:p-0 print:shadow-none print:border-none">
          <div className="text-center font-bold text-xs mb-6 uppercase">
            BUKU CATATAN KINERJA (BCK) {type === 'guru' ? 'GURU' : 'KEPALA'}<br />
            BULAN {currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
          </div>
          <div className="mb-4 space-y-0.5">
            <div className="flex"><div className="w-40 font-bold text-[10px]">NAMA</div><div className="font-bold text-[10px]">: {type === 'guru' ? profile.name : profile.headmasterName}</div></div>
            <div className="flex"><div className="w-40 font-bold text-[10px]">NUPTK/NPK/PEG.ID</div><div className="font-bold text-[10px]">: {type === 'guru' ? `${profile.nuptk} / ${profile.npk} / ${profile.pegId}` : `${profile.headmasterNuptk || '-'} / ${profile.headmasterNpk || '-'} / ${profile.headmasterPegId || '-'}`}</div></div>
            <div className="flex"><div className="w-40 font-bold text-[10px]">JABATAN</div><div className="font-bold text-[10px]">: {type === 'guru' ? profile.jabatan : 'Kepala Madrasah'}</div></div>
            <div className="flex"><div className="w-40 font-bold text-[10px]">RA/MADRASAH</div><div className="font-bold text-[10px]">: {profile.school}</div></div>
          </div>
          <table className="w-full border-collapse border-2 border-black text-[10px] relative leading-tight">
            <thead className="bg-yellow-400">
              <tr>
                <th className="border-2 border-black p-0.5 w-[30px] text-center">NO</th>
                <th className="border-2 border-black p-0.5 w-[140px] text-center">TANGGAL KEGIATAN</th>
                <th className="border-2 border-black p-0.5 text-center">KEGIATAN HARIAN</th>
                <th className="border-2 border-black p-0.5 w-[80px] text-center">KUANTITAS</th>
              </tr>
            </thead>
            <tbody>
              {currentLog.activities.map((act, idx) => (
                <tr key={act.id} className={`${act.isHoliday ? 'bg-gray-200' : ''} ${openDbRowId === act.id ? 'bg-blue-50/50 outline outline-2 outline-blue-500/30' : ''}`}>
                  <td className="border-2 border-black p-0.5 text-center">{idx + 1}</td>
                  <td className="border-2 border-black p-0.5 text-center leading-[1.1]">{act.date}</td>
                  <td className="border-2 border-black p-0 group relative align-middle">
                    <div className="flex flex-col divide-y-2 divide-black">
                      <div className="flex items-center justify-center min-h-[22px] group/row relative">
                        <textarea 
                          className="w-full p-0.5 bg-transparent resize-none outline-none border-none overflow-hidden block text-center leading-[1.2]" 
                          rows={1} 
                          value={act.description} 
                          onChange={e => updateActivity(act.id, { description: e.target.value })} 
                          style={{ height: 'auto', minHeight: '18px' }} 
                        />
                        {!act.isHoliday && (
                          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover/row:opacity-100 transition no-print z-10">
                            {type === 'kepala' && <button onClick={() => addSubActivity(act.id)} title="Tambah Baris" className="p-0.5 bg-green-500 text-white rounded shadow-sm hover:bg-green-600 transition"><Plus size={8} /></button>}
                            <button onClick={() => { setDbSelectionContext({ parentId: act.id }); setOpenDbRowId(openDbRowId === act.id ? null : act.id); }} title="Pilih dari Database" className={`p-0.5 bg-white rounded border shadow-sm ${openDbRowId === act.id ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-blue-500'} hover:bg-blue-50`}><Database size={8} /></button>
                            {act.description && <button onClick={() => { setAiLoading(true); refineActivity(act.description).then(res => { updateActivity(act.id, { description: res }); setAiLoading(false); }); }} title="Perbaiki Kalimat (AI)" className="p-0.5 bg-white rounded border shadow-sm text-indigo-500 hover:bg-indigo-50"><Sparkles size={8} /></button>}
                          </div>
                        )}
                      </div>
                      {(act.subActivities || []).map((sub) => (
                        <div key={sub.id} className="flex items-center justify-center min-h-[22px] group/sub relative">
                          <textarea 
                            className="w-full p-0.5 bg-transparent resize-none outline-none border-none overflow-hidden block text-center leading-[1.2]" 
                            rows={1} 
                            value={sub.description} 
                            onChange={e => updateSubActivity(act.id, sub.id, { description: e.target.value })} 
                            style={{ height: 'auto', minHeight: '18px' }} 
                          />
                          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover/sub:opacity-100 transition no-print z-10">
                            <button onClick={() => { setDbSelectionContext({ parentId: act.id, subId: sub.id }); setOpenDbRowId(openDbRowId === sub.id ? null : sub.id); }} title="Pilih dari Database" className={`p-0.5 bg-white rounded border shadow-sm ${openDbRowId === sub.id ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-blue-500'} hover:bg-blue-50`}><Database size={8} /></button>
                            {sub.description && <button onClick={() => { setAiLoading(true); refineActivity(sub.description).then(res => { updateSubActivity(act.id, sub.id, { description: res }); setAiLoading(false); }); }} title="Perbaiki Kalimat (AI)" className="p-0.5 bg-white rounded border shadow-sm text-indigo-500 hover:bg-indigo-50"><Sparkles size={8} /></button>}
                            {type === 'kepala' && <button onClick={() => removeSubActivity(act.id, sub.id)} title="Hapus Baris" className="p-0.5 bg-red-500 text-white rounded shadow-sm hover:bg-red-600 transition"><Trash size={8} /></button>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Floating Database Selection Menu */}
                    {openDbRowId && (openDbRowId === act.id || (act.subActivities || []).some(s => s.id === openDbRowId)) && !act.isHoliday && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-blue-200 shadow-2xl rounded-xl p-3 z-[100] no-print animate-in fade-in slide-in-from-top-2 duration-200 min-w-[300px]">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1"><MousePointerClick size={10}/> Pilih Kegiatan</span>
                          <button onClick={() => setOpenDbRowId(null)} className="text-gray-400 hover:text-red-500 transition"><X size={14}/></button>
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
                          {activityDb.length > 0 ? activityDb.map((dbItem, dbIdx) => (
                            <button 
                              key={dbIdx} 
                              onClick={() => { 
                                if (dbSelectionContext?.subId) {
                                  updateSubActivity(dbSelectionContext.parentId, dbSelectionContext.subId, { description: dbItem });
                                } else {
                                  updateActivity(act.id, { description: dbItem });
                                }
                                setOpenDbRowId(null); 
                              }}
                              className="text-left text-[11px] p-2 hover:bg-blue-600 hover:text-white rounded-lg transition-all border border-transparent hover:border-blue-400 group flex items-center gap-2"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 group-hover:bg-white shrink-0"></div>
                              {dbItem}
                            </button>
                          )) : (
                            <div className="text-center py-4 text-gray-400 text-[10px] italic">
                              Database kosong. Tambah kegiatan di menu Settings.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="border-2 border-black p-0 text-center align-middle relative">
                    <div className="flex flex-col divide-y-2 divide-black">
                      <div className="flex items-center justify-center min-h-[22px] group/qty relative">
                        <input className="w-full p-0.5 bg-transparent text-center border-none outline-none" value={act.quantity} onChange={e => updateActivity(act.id, { quantity: e.target.value })}/>
                        <button onClick={() => { setDbSelectionContext({ parentId: act.id }); setOpenQtyRowId(openQtyRowId === act.id ? null : act.id); }} title="Pilih Kuantitas" className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/qty:opacity-100 transition no-print p-0.5 text-gray-400 hover:text-blue-600"><Database size={8} /></button>
                      </div>
                      {(act.subActivities || []).map((sub) => (
                        <div key={sub.id} className="flex items-center justify-center min-h-[22px] group/subqty relative">
                          <input className="w-full p-0.5 bg-transparent text-center border-none outline-none" value={sub.quantity} onChange={e => updateSubActivity(act.id, sub.id, { quantity: e.target.value })}/>
                          <button onClick={() => { setDbSelectionContext({ parentId: act.id, subId: sub.id }); setOpenQtyRowId(openQtyRowId === sub.id ? null : sub.id); }} title="Pilih Kuantitas" className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/subqty:opacity-100 transition no-print p-0.5 text-gray-400 hover:text-blue-600"><Database size={8} /></button>
                        </div>
                      ))}
                    </div>
                    {openQtyRowId && (openQtyRowId === act.id || (act.subActivities || []).some(s => s.id === openQtyRowId)) && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-blue-200 shadow-2xl rounded-lg p-2 z-[100] no-print animate-in fade-in slide-in-from-top-2 duration-200 min-w-[120px]">
                        <div className="flex flex-col gap-1">
                          {quantityDb.map((qty, qIdx) => (
                            <button 
                              key={qIdx} 
                              onClick={() => { 
                                if (dbSelectionContext?.subId) {
                                  updateSubActivity(dbSelectionContext.parentId, dbSelectionContext.subId, { quantity: qty });
                                } else {
                                  updateActivity(act.id, { quantity: qty });
                                }
                                setOpenQtyRowId(null); 
                              }}
                              className="text-center text-[10px] p-1.5 hover:bg-blue-600 hover:text-white rounded transition-all border border-transparent hover:border-blue-400"
                            >
                              {qty}
                            </button>
                          ))}
                          <button onClick={() => setOpenQtyRowId(null)} className="mt-1 text-[8px] text-gray-400 hover:text-red-500 uppercase font-bold tracking-tighter">Close</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 grid grid-cols-2 gap-10 print:mt-2 print:gap-4">
            <div className="text-center text-[10px]">
              <p className="mb-10">Mengetahui<br/>{type === 'guru' ? 'Kepala Madrasah' : 'Pengawas Madrasah'}</p>
              <p className="font-bold underline uppercase">
                {type === 'guru' ? profile.headmasterName : (profile.supervisorName || '-')}
              </p>
              <p>Nip. {type === 'guru' ? (profile.headmasterNip || '-') : (profile.supervisorNip || '-')}</p>
            </div>
            <div className="text-center text-[10px]">
              <p className="mb-10">{profile.location}, {currentLog.activities[currentLog.activities.length - 1].date}<br/>{type === 'guru' ? 'Guru Kelas/Mapel' : 'Kepala Madrasah'}</p>
              <p className="font-bold underline uppercase">{type === 'guru' ? profile.name : profile.headmasterName}</p>
              <p>Nip. {type === 'guru' ? (profile.nip || '-') : (profile.headmasterNip || '-')}</p>
            </div>
          </div>
        </div>
    </div>
  );

  const SettingsView = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-gray-500 hover:text-blue-600 font-medium"><ArrowLeft size={20} /><span>Kembali</span></button>
        <h2 className="text-2xl font-bold text-gray-800">Isi Data Base</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Database size={18} className="text-blue-600" />Database Kegiatan</h3>
          <ActivityDbInput onAdd={(item) => setActivityDb([...activityDb, item])} />
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {activityDb.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-transparent hover:border-gray-200">
                <span className="text-sm text-gray-700">{item}</span>
                <button onClick={() => setActivityDb(activityDb.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500 p-1"><Trash size={16} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Database size={18} className="text-blue-600" />Database Kuantitas</h3>
          <div className="flex flex-col gap-4">
            {['1 Kegiatan', '2 Kegiatan', '3 Kegiatan', '4 Kegiatan'].map((item) => (
              <label key={item} className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-transparent hover:border-blue-200 cursor-pointer transition-all group">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  checked={quantityDb.includes(item)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setQuantityDb([...quantityDb, item].sort());
                    } else {
                      setQuantityDb(quantityDb.filter(q => q !== item));
                    }
                  }}
                />
                <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-600 transition">{item}</span>
              </label>
            ))}
          </div>
          <p className="mt-6 text-[10px] text-gray-400 font-medium italic">Centang kuantitas yang ingin dimunculkan sebagai pilihan cepat di tabel.</p>
        </div>
      </div>
      <div className="mt-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Settings size={18} className="text-blue-600" />Master Data</h3>
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={() => {
              const data = {
                profile,
                logs,
                importedKaldik,
                activityDb,
                quantityDb,
                version: '1.0.0',
                exportedAt: new Date().toISOString()
              };
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `BCK_Backup_${new Date().toLocaleDateString('id-ID').replace(/\//g, '-')}.json`;
              a.click();
              showToast("Backup berhasil diunduh", "success");
            }}
            className="flex items-center gap-2 bg-blue-600 text-white py-3 px-6 rounded-xl hover:bg-blue-700 transition text-sm font-semibold shadow-md"
          >
            <Upload size={18} className="rotate-180" /> <span>Ekspor Data (Backup)</span>
          </button>
          
          <button 
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (re) => {
                  try {
                    const data = JSON.parse(re.target?.result as string);
                    if (data.profile) setProfile(prev => ({ ...prev, ...data.profile }));
                    if (data.logs) setLogs(data.logs);
                    if (data.importedKaldik) setImportedKaldik(data.importedKaldik);
                    if (data.activityDb) setActivityDb(data.activityDb);
                    if (data.quantityDb) setQuantityDb(data.quantityDb);
                    showToast("Data berhasil direstore", "success");
                    setTimeout(() => window.location.reload(), 1500);
                  } catch (err) {
                    showToast("Format file backup tidak valid", "error");
                  }
                };
                reader.readAsText(file);
              };
              input.click();
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white py-3 px-6 rounded-xl hover:bg-indigo-700 transition text-sm font-semibold shadow-md"
          >
            <Upload size={18} /> <span>Impor Data (Restore)</span>
          </button>

          <button 
            onClick={() => { if (confirm("Peringatan: Seluruh data akan dihapus permanen. Lanjutkan?")) { localStorage.clear(); window.location.reload(); }}} 
            className="flex items-center gap-2 bg-red-600/10 text-red-600 py-3 px-6 rounded-xl hover:bg-red-600 hover:text-white transition text-sm font-semibold border border-red-100"
          >
            <Trash size={18} /> <span>Hapus Seluruh Data</span>
          </button>
        </div>
        <p className="mt-6 text-[10px] text-gray-400 font-medium italic">Catatan: Karena aplikasi ini berjalan secara mandiri (Local-First), sangat disarankan untuk melakukan **Ekspor Data** secara berkala untuk menghindari kehilangan catatan jika browser dibersihkan.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar navigation */}
      <aside className={`no-print bg-white border-r border-gray-200 transition-all duration-300 flex flex-col z-30 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="p-6 flex items-center gap-3 border-b border-gray-50 mb-4">
          <div className="bg-blue-600 p-2 rounded-xl text-white">
            <FileText size={24} />
          </div>
          {isSidebarOpen && (
            <div className="flex items-center justify-between flex-1">
              <span className="font-black text-lg tracking-tight text-gray-800">BCK Smart</span>
              <button 
                onClick={() => { if (confirm("Peringatan: Seluruh data akan dihapus permanen. Lanjutkan?")) { localStorage.clear(); window.location.reload(); }}}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Reset Semua Data"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 pt-4">
          <button 
            onClick={() => setView('dashboard')}
            className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${view === 'dashboard' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <LayoutDashboard size={22} /><span className={`${!isSidebarOpen && 'hidden'} font-bold text-sm`}>Dashboard</span>
          </button>
          <button 
            onClick={() => setView('bck-guru')}
            className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${view === 'bck-guru' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <UserCheck size={22} /><span className={`${!isSidebarOpen && 'hidden'} font-bold text-sm`}>BCK Guru</span>
          </button>
          <button 
            onClick={() => setView('bck-kepala')}
            className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${view === 'bck-kepala' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <Users size={22} /><span className={`${!isSidebarOpen && 'hidden'} font-bold text-sm`}>BCK Kepala</span>
          </button>
          <button 
            onClick={() => setView('kaldik')}
            className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${view === 'kaldik' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <CalendarIcon size={22} /><span className={`${!isSidebarOpen && 'hidden'} font-bold text-sm`}>Kaldik</span>
          </button>
          <button 
            onClick={() => setView('absen-finger')}
            className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${view === 'absen-finger' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <MousePointerClick size={22} /><span className={`${!isSidebarOpen && 'hidden'} font-bold text-sm`}>Absen Finger</span>
          </button>
          <button 
            onClick={() => setView('settings')}
            className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${view === 'settings' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <SettingsIcon size={22} /><span className={`${!isSidebarOpen && 'hidden'} font-bold text-sm`}>Isi Data Base</span>
          </button>
        </nav>

        <div className="p-4 border-t border-gray-50">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="w-full flex items-center justify-center p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-2xl transition">
            <Menu size={20} />
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto relative bg-gray-50 h-screen print:h-auto print:bg-white print:overflow-visible">
        {notification.message && (
          <div className={`fixed top-6 right-6 z-[1000] px-6 py-4 rounded-2xl shadow-xl border flex items-center space-x-3 animate-in fade-in slide-in-from-top-4 no-print ${notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <CheckCircle2 size={24} />
            <span className="font-bold">{notification.message}</span>
          </div>
        )}
        
        <div className="container mx-auto px-4 sm:px-8 py-8 md:py-12 print:p-0 print:m-0">
          {view === 'dashboard' && DashboardView()}
          {view === 'bck-guru' && BCKLogView({ type: 'guru' })}
          {view === 'bck-kepala' && BCKLogView({ type: 'kepala' })}
          {view === 'kaldik' && (
            <KaldikView 
              importedKaldik={importedKaldik}
              setImportedKaldik={setImportedKaldik}
              applyKaldikToLogs={applyKaldikToLogs}
              handleFileUpload={handleFileUpload}
              fileInputRef={fileInputRef}
              setView={setView}
              showToast={showToast}
            />
          )}
          {view === 'absen-finger' && <FingerprintView profile={profile} logs={logs} importedKaldik={importedKaldik} currentDate={currentDate} showToast={showToast} />}
          {view === 'settings' && SettingsView()}
        </div>

        {aiLoading && (
          <div className="fixed inset-0 bg-white/50 backdrop-blur-[1px] z-[1000] flex items-center justify-center animate-in fade-in no-print">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center space-y-4 border border-gray-100">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p className="font-bold text-gray-700">Gemini sedang bekerja...</p>
            </div>
          </div>
        )}

        {/* Loading Overlay for Scanning Kaldik */}
        {isScanning && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6 no-print">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="bg-black border-2 border-cyan-500 p-8 rounded-full shadow-[0_0_50px_rgba(0,243,255,0.4)] relative">
                <ScanSearch className="text-cyan-400 animate-bounce" size={64} />
              </div>
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-cyan-500 text-black px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase animate-pulse">
                AI SCANNING
              </div>
            </div>
            <h2 className="text-2xl font-black text-white mb-2 tracking-[0.2em]">NYO'UNAH SABBER DHIMIN</h2>
            <p className="text-cyan-400/60 font-mono text-sm uppercase tracking-widest max-w-md">
              Menganalisis Dokumen Kaldik... <br/>
              Menghitung Hari Efektif & Libur...
            </p>
            <div className="mt-8 w-64 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 animate-pulse" style={{ width: '40%' }}></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
