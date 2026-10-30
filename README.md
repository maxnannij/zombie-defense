# 🧟 Zombie Defense – Defiende tu barrio

Juego de tower defense sobre el mapa real de tu barrio.

- Usa tu ubicación GPS
- Carga las calles reales de OpenStreetMap
- Los zombies **solo se mueven por las calles**
- Colocás defensores blancos y barricadas
- Matás zombies → oro → más unidades
- **Firebase**: Auth anónimo + guardado de progreso + ranking

---

## Probar en local

```bash
cd zombie-defense
python -m http.server 8080
```

Abrí `http://localhost:8080` y permití la ubicación.

---

## 1. Configurar Firebase

1. Creá proyecto en [console.firebase.google.com](https://console.firebase.google.com)
2. Agregá app web y copiá `firebaseConfig`
3. Pegalo en `js/firebase.js`
4. Actualizá `.firebaserc` con tu `projectId`
5. Authentication → habilitá **Anonymous**
6. Creá Firestore + publicá las reglas del README

## 2. Deploy

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
cd zombie-defense
firebase deploy --only hosting
```

### GitHub Pages
Settings → Pages → branch `main` → Save

URL: https://maxnannij.github.io/zombie-defense/

## Checklist
- [ ] firebaseConfig real en `js/firebase.js`
- [ ] `.firebaserc` con projectId correcto
- [ ] Anonymous auth + Firestore + reglas
- [ ] Deploy hecho
