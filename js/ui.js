export function showToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

export function updateHUD({ gold, wave, zombiesAlive }) {
  if (gold !== undefined) document.getElementById('gold').textContent = gold;
  if (wave !== undefined) document.getElementById('wave').textContent = wave;
  if (zombiesAlive !== undefined) document.getElementById('zombies-alive').textContent = zombiesAlive;
}
