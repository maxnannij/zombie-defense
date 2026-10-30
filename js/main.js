import { Game } from './game.js';
import { initFirebase } from './firebase.js';

const btnStart = document.getElementById('btn-start');
const geoError = document.getElementById('geo-error');
const screenStart = document.getElementById('screen-start');
const screenGame = document.getElementById('screen-game');

let game = null;

btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  btnStart.textContent = 'Conectando...';
  geoError.classList.add('hidden');

  try {
    btnStart.textContent = 'Iniciando sesión...';
    const firebaseOk = await initFirebase();

    btnStart.textContent = 'Obteniendo ubicación...';
    let lat, lng;
    let usedFallback = false;

    try {
      const position = await getCurrentPosition();
      lat = position.coords.latitude;
      lng = position.coords.longitude;
    } catch (geoErr) {
      console.warn('Geolocalización falló, usando ubicación de demo:', geoErr.message);
      lat = -34.5075;
      lng = -58.4880;
      usedFallback = true;
    }

    screenStart.classList.add('hidden');
    screenGame.classList.remove('hidden');

    game = new Game({
      lat,
      lng,
      radiusMeters: 280,
      firebaseEnabled: firebaseOk
    });

    await game.initSelectMode();

    if (usedFallback) {
      setTimeout(() => {
        const t = document.getElementById('toast');
        if (t) {
          t.textContent = 'Ubicación de demo (Olivos). Mové el mapa a tu manzana.';
          t.classList.remove('hidden');
          setTimeout(() => t.classList.add('hidden'), 4500);
        }
      }, 800);
    }
  } catch (err) {
    console.error(err);
    geoError.textContent = err.message || 'Error al iniciar. Intentá de nuevo.';
    geoError.classList.remove('hidden');
    btnStart.disabled = false;
    btnStart.textContent = 'Comenzar';
  }
});

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu navegador no soporta geolocalización.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        let msg = 'Error al obtener ubicación.';
        if (err.code === 1) msg = 'Permiso de ubicación denegado.';
        if (err.code === 2) msg = 'Ubicación no disponible.';
        if (err.code === 3) msg = 'Tiempo de espera agotado.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
