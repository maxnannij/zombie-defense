import { Game } from './game.js';
import { initFirebase } from './firebase.js';
import { getDefaultCenter } from './streets.js';

const btnStart = document.getElementById('btn-start');
const geoError = document.getElementById('geo-error');
const screenStart = document.getElementById('screen-start');
const screenGame = document.getElementById('screen-game');

let game = null;

btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  btnStart.textContent = 'Cargando...';
  geoError.classList.add('hidden');

  try {
    btnStart.textContent = 'Iniciando sesión...';
    const firebaseOk = await initFirebase();

    btnStart.textContent = 'Cargando mapa...';
    const center = await getDefaultCenter();

    screenStart.classList.add('hidden');
    screenGame.classList.remove('hidden');

    game = new Game({
      lat: center.lat,
      lng: center.lng,
      radiusMeters: 280,
      firebaseEnabled: firebaseOk
    });

    await game.initSelectMode();
  } catch (err) {
    console.error(err);
    geoError.textContent = err.message || 'Error al iniciar. Intentá de nuevo.';
    geoError.classList.remove('hidden');
    btnStart.disabled = false;
    btnStart.textContent = 'Comenzar';
  }
});
