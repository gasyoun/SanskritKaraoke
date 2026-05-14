// Firebase Cloud Sync for SRS and Telemetry
// Uses Firebase Modular SDK (v11+)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Current user state
window.currentUser = null;

// UI Update Function (Placeholder, can be overridden by pages)
window.onAuthUpdate = (user) => {
  console.log('Auth Update:', user ? user.email : 'Logged out');
  if (user) {
    // Trigger initial sync on login
    syncFromCloud(user.uid, 'srs_v1');
    syncFromCloud(user.uid, 'telemetry');
  }
};

onAuthStateChanged(auth, (user) => {
  window.currentUser = user;
  if (window.onAuthUpdate) window.onAuthUpdate(user);
});

export async function login() {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

export async function logout() {
  await signOut(auth);
}

/**
 * Syncs local data to Firestore.
 */
export async function syncToCloud(dataType, payload) {
  if (!window.currentUser) return;
  
  const uid = window.currentUser.uid;
  const docRef = doc(db, "users", uid, "data", dataType);
  
  try {
    await setDoc(docRef, {
      payload: payload,
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log(`Cloud sync success: ${dataType}`);
  } catch (e) {
    console.error(`Cloud sync failed: ${dataType}`, e);
  }
}

/**
 * Syncs Firestore data to local storage.
 */
export async function syncFromCloud(uid, dataType) {
  const docRef = doc(db, "users", uid, "data", dataType);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const remote = docSnap.data().payload;
      const local = JSON.parse(localStorage.getItem(dataType) || '[]');
      
      // Merge logic: Simple "Union" for SRS records by ID, preferring remote if newer
      // Note: A more complex merge (timestamp based) is ideal, but for now we sync remote.
      if (remote && JSON.stringify(remote) !== JSON.stringify(local)) {
        localStorage.setItem(dataType, JSON.stringify(remote));
        console.log(`Cloud download success: ${dataType}`);
        // Refresh page if on progress.html to show new data
        if (window.location.pathname.includes('progress.html') && typeof loadProgress === 'function') {
            loadProgress();
        }
      }
    }
  } catch (e) {
    console.warn(`Cloud download failed: ${dataType}`, e);
  }
}

// Attach to window for non-module scripts
window.cloudLogin = login;
window.cloudLogout = logout;
window.syncToCloud = syncToCloud;
