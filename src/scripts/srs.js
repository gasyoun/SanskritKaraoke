// SRS (Spaced Repetition System) using SM-2 Algorithm and Streak Tracking
const SRS_KEY = 'srs_v1';
const PROGRESS_META_KEY = 'progress_meta';

function normalizeSrsRecord(record) {
  if (!record || !record.id) return null;
  return {
    ...record,
    id: String(record.id),
    interval: Number(record.interval) || 0,
    ef: Number(record.ef) || 2.5,
    due: record.due || getTodayStr(),
    reps: Number(record.reps) || 0,
    updated_at: record.updated_at || null
  };
}

function getSrsData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SRS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSrsRecord).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function saveSrsData(data) {
  const normalized = Array.isArray(data)
    ? data.map(normalizeSrsRecord).filter(Boolean)
    : [];
  localStorage.setItem(SRS_KEY, JSON.stringify(normalized));
  if (typeof syncToCloud === 'function') {
    syncToCloud(SRS_KEY, normalized);
  }
}

function getSrsRecord(id) {
  const data = getSrsData();
  return data.find(r => r.id === id) || { id, interval: 0, ef: 2.5, due: getTodayStr(), reps: 0, updated_at: null };
}

function updateSrs(id, quality) {
  let data = getSrsData();
  let record = data.find(r => r.id === id);
  if (!record) {
    record = { id, interval: 0, ef: 2.5, due: getTodayStr(), reps: 0, updated_at: null };
    data.push(record);
  }
  const score = Math.max(0, Math.min(5, Number(quality) || 0));

  // SM-2 Algorithm
  if (score >= 3) {
    if (record.reps === 0) {
      record.interval = 1;
    } else if (record.reps === 1) {
      record.interval = 6;
    } else {
      record.interval = Math.round(record.interval * record.ef);
    }
    record.reps++;
  } else {
    record.reps = 0;
    record.interval = 1;
  }

  record.ef = record.ef + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));
  if (record.ef < 1.3) record.ef = 1.3;

  const due = new Date();
  due.setDate(due.getDate() + record.interval);
  record.due = due.toISOString().split('T')[0];
  record.updated_at = new Date().toISOString();
  
  saveSrsData(data);
  updateStreak();
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getProgressMeta() {
  return {
    lastPlayed: localStorage.getItem('shloka_last_played') || null,
    streak: getStreak()
  };
}

function saveProgressMeta(meta) {
  if (!meta || typeof meta !== 'object') return;

  const lastPlayed = meta.lastPlayed || meta.last_played;
  const streak = Number(meta.streak);

  if (lastPlayed) {
    localStorage.setItem('shloka_last_played', lastPlayed);
  }
  if (Number.isFinite(streak)) {
    localStorage.setItem('shloka_streak', String(Math.max(0, Math.round(streak))));
  }

  localStorage.setItem(PROGRESS_META_KEY, JSON.stringify(getProgressMeta()));
}

// F7 Streak & Progress Logic
function updateStreak() {
  const today = getTodayStr();
  let lastPlayed = localStorage.getItem('shloka_last_played');
  let streak = parseInt(localStorage.getItem('shloka_streak') || '0', 10) || 0;

  if (lastPlayed) {
    if (lastPlayed !== today) {
      const lastDate = new Date(lastPlayed);
      const currDate = new Date(today);
      const diffTime = Math.abs(currDate - lastDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        streak++;
      } else if (diffDays > 1) {
        streak = 1;
      }
    }
  } else {
    streak = 1;
  }
  
  localStorage.setItem('shloka_last_played', today);
  localStorage.setItem('shloka_streak', String(streak));
  localStorage.setItem(PROGRESS_META_KEY, JSON.stringify(getProgressMeta()));
  
  // Sync progress metadata and telemetry as well.
  if (typeof syncToCloud === 'function') {
    syncToCloud(PROGRESS_META_KEY, getProgressMeta());
    let telemetry = [];
    try {
      telemetry = JSON.parse(localStorage.getItem('telemetry') || '[]');
    } catch (e) {
      telemetry = [];
    }
    syncToCloud('telemetry', telemetry);
  }
}

function getStreak() {
  return parseInt(localStorage.getItem('shloka_streak') || '0', 10) || 0;
}
