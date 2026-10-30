/**
 * Firebase – Auth anónimo + Firestore para guardar progreso
 *
 * INSTRUCCIONES PARA CONFIGURAR:
 * 1. Andá a https://console.firebase.google.com
 * 2. Creá un proyecto (o usá uno existente)
 * 3. Agregá una app web → copiá el firebaseConfig
 * 4. Pegá el config abajo (reemplazá los valores de ejemplo)
 * 5. En Authentication → Sign-in method → habilitá "Anonymous"
 * 6. En Firestore Database → Create database (modo producción o test)
 * 7. Reglas de seguridad recomendadas (ver README)
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ⚠️ REEMPLAZÁ ESTE OBJETO CON EL DE TU PROYECTO
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let ready = false;

/**
 * Inicializa Firebase y hace login anónimo.
 * Devuelve true si se pudo conectar, false si el config es inválido.
 */
export async function initFirebase() {
  // Detectar si el usuario todavía no configuró Firebase
  if (firebaseConfig.apiKey === "TU_API_KEY") {
    console.warn('[Firebase] Config no reemplazado. El juego funciona offline.');
    return false;
  }

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    await new Promise((resolve, reject) => {
      const unsub = onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUser = user;
          ready = true;
          unsub();
          resolve();
        }
      }, reject);

      // Si no hay usuario, hacemos sign-in anónimo
      signInAnonymously(auth).catch(reject);
    });

    console.log('[Firebase] Conectado. UID:', currentUser.uid);
    return true;
  } catch (err) {
    console.error('[Firebase] Error de inicialización:', err);
    return false;
  }
}

export function isFirebaseReady() {
  return ready && currentUser !== null;
}

export function getUid() {
  return currentUser?.uid ?? null;
}

/**
 * Carga el progreso guardado del jugador.
 * Estructura del documento:
 * users/{uid} → {
 *   gold, bestWave, totalKills,
 *   lastLat, lastLng,
 *   upgrades: {},
 *   updatedAt
 * }
 */
export async function loadProgress() {
  if (!isFirebaseReady()) return null;

  try {
    const ref = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (err) {
    console.error('[Firebase] Error cargando progreso:', err);
    return null;
  }
}

/**
 * Guarda el progreso actual.
 */
export async function saveProgress(data) {
  if (!isFirebaseReady()) return false;

  try {
    const ref = doc(db, 'users', currentUser.uid);
    await setDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firebase] Error guardando progreso:', err);
    return false;
  }
}

/**
 * Guarda un score alto en un ranking simple.
 * leaderboard/{uid} → { bestWave, totalKills, displayName, updatedAt }
 */
export async function saveLeaderboardEntry({ bestWave, totalKills, displayName = 'Anónimo' }) {
  if (!isFirebaseReady()) return false;

  try {
    const ref = doc(db, 'leaderboard', currentUser.uid);
    await setDoc(ref, {
      bestWave,
      totalKills,
      displayName,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firebase] Error en leaderboard:', err);
    return false;
  }
}
