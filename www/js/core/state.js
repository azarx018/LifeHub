/* ===== STATE ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
// Semua fitur import { S } from '../core/state.js' dan baca/tulis field-nya
// langsung (object reference sama seperti sebelumnya, jadi perilaku identik).
import { today } from './utils.js';

export const S = {
  currentPage: 'dashboard',
  todoFilter: 'all',
  todoPriority: 'all',
  todoSearch: '',
  habitDate: today(),
  sholatDate: today(),
  journalDate: today(),
  journalSearch: '',
  activityRange: 7,
  activityWeekOffset: 0,
  trendMetric: 'habit', // Trend chart (Stats) — 'habit' | 'sholat' | 'sleep' | 'water'
  trendWeeks: 8,
  waterDate: today(), // 0 = minggu ini, -1 = minggu lalu, dst
  settings: { name:'Azhar', darkMode:false, sleepTarget:8, waterTarget:8 },
  todos: [], habits: [], habitLogs: [], journals: [],
  sleepLogs: [], goals: [], milestones: [], waterLogs: [],
  sholatLogs: [],
  sleepSession: null
};
