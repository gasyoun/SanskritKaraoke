// SRS (Spaced Repetition System) using SM-2 Algorithm and Streak Tracking
const SRS_KEY = 'srs_v1';

function getSrsData() {
  try {
    return JSON.parse(localStorage.getItem(SRS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveSrsData(data) {
  localStorage.setItem(SRS_KEY, JSON.stringify(data));
}

function getSrsRecord(id) {
  const data = getSrsData();
  return data.find(r => r.id === id) || { id, interval: 0, ef: 2.5, due: getTodayStr(), reps: 0 };
}

function updateSrs(id, quality) {
  let data = getSrsData();
  let record = data.find(r => r.id === id);
  if (!record) {
    record = { id, interval: 0, ef: 2.5, due: getTodayStr(), reps: 0 };
    data.push(record);
  }

  // SM-2 Algorithm
  if (quality >= 3) {
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

  record.ef = record.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (record.ef < 1.3) record.ef = 1.3;

  const due = new Date();
  due.setDate(due.getDate() + record.interval);
  record.due = due.toISOString().split('T')[0];
  
  saveSrsData(data);
  updateStreak();
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// F7 Streak & Progress Logic
function updateStreak() {
  const today = getTodayStr();
  let lastPlayed = localStorage.getItem('shloka_last_played');
  let streak = parseInt(localStorage.getItem('shloka_streak') || '0', 10);

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
  localStorage.setItem('shloka_streak', streak);
}

function getStreak() {
  return parseInt(localStorage.getItem('shloka_streak') || '0', 10);
}
