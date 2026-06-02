// Firebase Cloud Sync for SRS, streak metadata, and telemetry.
// Uses Firebase Modular SDK (v11+) once a real Firebase config is present.

const CLOUD_DATA_TYPES = ['srs_v1', 'telemetry', 'progress_meta'];
const PLACEHOLDER_RE = /^YOUR_|YOUR_/;

function isFirebaseConfigured(config) {
  return Boolean(
    config &&
    config.apiKey &&
    config.projectId &&
    !PLACEHOLDER_RE.test(config.apiKey) &&
    !PLACEHOLDER_RE.test(config.projectId)
  );
}

function dispatchAppEvent(name, detail = {}) {
  if (typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new window.CustomEvent(name, { detail }));
    return;
  }

  const event = document.createEvent('CustomEvent');
  event.initCustomEvent(name, false, false, detail);
  window.dispatchEvent(event);
}

function emitCloudSyncStatus(status, detail = {}) {
  window.cloudSyncStatus = status;
  dispatchAppEvent('cloud-sync-status', { status, ...detail });
}

function parseLocalJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    return parsed == null ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

function getLocalPayload(dataType) {
  if (dataType === 'srs_v1' && typeof getSrsData === 'function') {
    return getSrsData();
  }
  if (dataType === 'progress_meta' && typeof getProgressMeta === 'function') {
    return getProgressMeta();
  }
  return parseLocalJson(dataType, dataType === 'progress_meta' ? {} : []);
}

function writeLocalPayload(dataType, payload) {
  if (dataType === 'progress_meta') {
    if (typeof saveProgressMeta === 'function') {
      saveProgressMeta(payload);
    } else {
      localStorage.setItem(dataType, JSON.stringify(payload || {}));
    }
    return;
  }

  const value = Array.isArray(payload) ? payload : [];
  localStorage.setItem(dataType, JSON.stringify(value));
}

function payloadHasContent(payload) {
  if (Array.isArray(payload)) return payload.length > 0;
  if (!payload || typeof payload !== 'object') return false;
  return Object.values(payload).some(value => value != null && value !== '' && value !== 0);
}

function payloadEquals(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function normalizeSrsCloudRecord(record) {
  if (!record || !record.id) return null;
  return {
    ...record,
    id: String(record.id),
    interval: Number(record.interval) || 0,
    ef: Number(record.ef) || 2.5,
    due: record.due || new Date().toISOString().split('T')[0],
    reps: Number(record.reps) || 0,
    updated_at: record.updated_at || null
  };
}

function recordScore(record) {
  const updatedAt = Date.parse(record.updated_at || '');
  if (!Number.isNaN(updatedAt)) return [1, updatedAt];

  const due = Date.parse(record.due || '');
  return [
    0,
    Number(record.interval) || 0,
    Number(record.reps) || 0,
    Number.isNaN(due) ? 0 : due
  ];
}

function compareScore(a, b) {
  const left = recordScore(a);
  const right = recordScore(b);
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function mergeSrsRecords(localPayload, remotePayload) {
  const mergedById = new Map();
  const addRecord = (record, preferLocal = false) => {
    const normalized = normalizeSrsCloudRecord(record);
    if (!normalized) return;

    const existing = mergedById.get(normalized.id);
    if (!existing || compareScore(normalized, existing) > 0 || (preferLocal && compareScore(normalized, existing) === 0)) {
      mergedById.set(normalized.id, normalized);
    }
  };

  (Array.isArray(remotePayload) ? remotePayload : []).forEach(record => addRecord(record));
  (Array.isArray(localPayload) ? localPayload : []).forEach(record => addRecord(record, true));

  return [...mergedById.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function mergeTelemetry(localPayload, remotePayload) {
  const byKey = new Map();
  const addEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    const key = [
      entry.timestamp || '',
      entry.event || '',
      entry.verse_id || '',
      JSON.stringify(entry.data || {})
    ].join('|');
    byKey.set(key, entry);
  };

  (Array.isArray(remotePayload) ? remotePayload : []).forEach(addEntry);
  (Array.isArray(localPayload) ? localPayload : []).forEach(addEntry);

  return [...byKey.values()]
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
    .slice(-100);
}

function normalizeProgressMeta(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return {
    lastPlayed: payload.lastPlayed || payload.last_played || null,
    streak: Number(payload.streak) || 0
  };
}

function mergeProgressMeta(localPayload, remotePayload) {
  const local = normalizeProgressMeta(localPayload);
  const remote = normalizeProgressMeta(remotePayload);
  const localTime = Date.parse(local.lastPlayed || '');
  const remoteTime = Date.parse(remote.lastPlayed || '');

  if (Number.isNaN(localTime) && Number.isNaN(remoteTime)) {
    return { lastPlayed: local.lastPlayed || remote.lastPlayed || null, streak: Math.max(local.streak, remote.streak) };
  }
  if (Number.isNaN(remoteTime) || localTime > remoteTime) return local;
  if (Number.isNaN(localTime) || remoteTime > localTime) return remote;

  return {
    lastPlayed: local.lastPlayed || remote.lastPlayed || null,
    streak: Math.max(local.streak, remote.streak)
  };
}

function mergePayload(dataType, localPayload, remotePayload) {
  if (dataType === 'srs_v1') return mergeSrsRecords(localPayload, remotePayload);
  if (dataType === 'telemetry') return mergeTelemetry(localPayload, remotePayload);
  if (dataType === 'progress_meta') return mergeProgressMeta(localPayload, remotePayload);
  return remotePayload ?? localPayload;
}

function refreshLocalViews() {
  if (window.location.pathname.includes('progress.html') && typeof loadProgress === 'function') {
    loadProgress();
  }
  dispatchAppEvent('cloud-sync-complete');
}

const cloudEnabled = isFirebaseConfigured(window.FIREBASE_CONFIG);
let firebaseRuntime = null;

async function loadFirebaseRuntime() {
  if (!cloudEnabled) return null;
  if (!firebaseRuntime) {
    firebaseRuntime = Promise.all([
      import('https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js')
    ]).then(([appModule, authModule, firestoreModule]) => {
      const app = appModule.initializeApp(window.FIREBASE_CONFIG);
      return {
        auth: authModule.getAuth(app),
        db: firestoreModule.getFirestore(app),
        provider: new authModule.GoogleAuthProvider(),
        doc: firestoreModule.doc,
        getDoc: firestoreModule.getDoc,
        setDoc: firestoreModule.setDoc,
        onAuthStateChanged: authModule.onAuthStateChanged,
        signInWithPopup: authModule.signInWithPopup,
        signOut: authModule.signOut
      };
    }).catch((error) => {
      firebaseRuntime = null;
      emitCloudSyncStatus('error', { message: error.message });
      throw error;
    });
  }
  return firebaseRuntime;
}

async function startAuthListener() {
  const runtime = await loadFirebaseRuntime();
  if (!runtime) return;

  runtime.onAuthStateChanged(runtime.auth, async (user) => {
    window.currentUser = user;
    if (window.onAuthUpdate) window.onAuthUpdate(user);

    if (user) {
      await migrateLocalDataToCloud(user.uid);
    } else {
      emitCloudSyncStatus('signed-out');
    }
  });
}

window.currentUser = null;
window.cloudSyncStatus = cloudEnabled ? 'idle' : 'disabled';

if (typeof window.onAuthUpdate !== 'function') {
  window.onAuthUpdate = (user) => {
    console.log('Auth Update:', user ? user.email : 'Logged out');
  };
}

if (!cloudEnabled) {
  console.warn('Cloud sync disabled: Firebase config is missing or still uses placeholders.');
  window.setTimeout(() => emitCloudSyncStatus('disabled'), 0);
}

if (cloudEnabled) {
  startAuthListener().catch((error) => {
    console.error('Cloud sync failed to initialize:', error);
  });
}

export async function login() {
  if (!cloudEnabled) {
    const message = 'Cloud sync is not configured yet. Fill src/scripts/firebase-config.js to enable it.';
    emitCloudSyncStatus('disabled', { message });
    alert(message);
    return null;
  }

  try {
    const runtime = await loadFirebaseRuntime();
    const result = await runtime.signInWithPopup(runtime.auth, runtime.provider);
    return result.user;
  } catch (error) {
    emitCloudSyncStatus('error', { message: error.message });
    console.error('Login failed:', error);
    throw error;
  }
}

export async function logout() {
  if (!cloudEnabled) return;
  const runtime = await loadFirebaseRuntime();
  await runtime.signOut(runtime.auth);
}

export async function syncToCloud(dataType, payload) {
  if (!cloudEnabled || !window.currentUser) return;

  const uid = window.currentUser.uid;

  try {
    const runtime = await loadFirebaseRuntime();
    const docRef = runtime.doc(runtime.db, 'users', uid, 'data', dataType);
    await runtime.setDoc(docRef, {
      payload,
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log(`Cloud sync success: ${dataType}`);
  } catch (e) {
    emitCloudSyncStatus('error', { dataType, message: e.message });
    console.error(`Cloud sync failed: ${dataType}`, e);
  }
}

export async function syncFromCloud(uid, dataType, options = {}) {
  if (!cloudEnabled || !uid) return getLocalPayload(dataType);

  const { mergeLocal = true, pushMerged = false } = options;

  try {
    const runtime = await loadFirebaseRuntime();
    const docRef = runtime.doc(runtime.db, 'users', uid, 'data', dataType);
    const docSnap = await runtime.getDoc(docRef);
    const local = getLocalPayload(dataType);
    const remote = docSnap.exists() ? docSnap.data().payload : null;
    const merged = mergeLocal ? mergePayload(dataType, local, remote) : remote;

    if (!payloadEquals(merged, local)) {
      writeLocalPayload(dataType, merged);
      console.log(`Cloud download success: ${dataType}`);
    }

    if (pushMerged && payloadHasContent(merged) && (!docSnap.exists() || !payloadEquals(merged, remote))) {
      await syncToCloud(dataType, merged);
    }

    return merged;
  } catch (e) {
    emitCloudSyncStatus('error', { dataType, message: e.message });
    console.warn(`Cloud download failed: ${dataType}`, e);
    return getLocalPayload(dataType);
  }
}

export async function migrateLocalDataToCloud(uid = window.currentUser && window.currentUser.uid) {
  if (!cloudEnabled || !uid) return;

  emitCloudSyncStatus('syncing');
  for (const dataType of CLOUD_DATA_TYPES) {
    await syncFromCloud(uid, dataType, { mergeLocal: true, pushMerged: true });
  }
  emitCloudSyncStatus('synced');
  refreshLocalViews();
}

window.cloudLogin = login;
window.cloudLogout = logout;
window.syncToCloud = syncToCloud;
window.syncFromCloud = syncFromCloud;
window.migrateLocalDataToCloud = migrateLocalDataToCloud;
