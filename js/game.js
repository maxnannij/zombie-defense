import { fetchStreets, findPath, nearestNode } from './streets.js';
import { updateHUD, showToast } from './ui.js';
import { loadProgress, saveProgress, saveLeaderboardEntry, isFirebaseReady } from './firebase.js';

const COST_DEFENDER = 50;
const COST_BARRICADE = 80;
const ZOMBIE_SPEED = 18;
const DEFENDER_RANGE = 45;
const DEFENDER_DAMAGE = 25;
const DEFENDER_COOLDOWN = 0.7;

export class Game {
  constructor({ lat, lng, radiusMeters = 280, firebaseEnabled = false }) {
    this.center = { lat, lng };
    this.radius = radiusMeters;
    this.firebaseEnabled = firebaseEnabled;
    this.map = null;
    this.graph = null;
    this.ready = false;
    this.gold = 120;
    this.wave = 0;
    this.bestWave = 0;
    this.totalKills = 0;
    this.zombies = [];
    this.defenders = [];
    this.barricades = [];
    this.tool = 'defender';
    this.lastTime = 0;
    this.running = false;
    this.homeNodeId = null;
    this._saveTimer = null;
    this._dirty = false;
    this.streetLayer = null;
    this.entityLayer = null;
    this.areaCircle = null;
  }

  async initSelectMode() {
    this._initMap();
    document.getElementById('crosshair').classList.remove('hidden');
    document.getElementById('select-overlay').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('controls').classList.add('hidden');
    this._updateAreaCircle();
    this.map.on('move', () => this._updateAreaCircle());
    document.getElementById('btn-confirm-area').onclick = () => this.confirmArea();
    showToast('Elegí la manzana moviendo el mapa');
  }

  _updateAreaCircle() {
    const c = this.map.getCenter();
    this.center = { lat: c.lat, lng: c.lng };
    if (this.areaCircle) {
      this.areaCircle.setLatLng(c);
    } else {
      this.areaCircle = L.circle(c, {
        radius: this.radius, color: '#c0392b', weight: 2,
        fillColor: '#c0392b', fillOpacity: 0.08, interactive: false
      }).addTo(this.map);
    }
  }

  async confirmArea() {
    const btn = document.getElementById('btn-confirm-area');
    btn.disabled = true;
    btn.textContent = 'Cargando calles...';
    showToast('Cargando calles de la manzana...');
    try {
      if (this.firebaseEnabled) {
        const progress = await loadProgress();
        if (progress) {
          this.gold = progress.gold ?? this.gold;
          this.bestWave = progress.bestWave ?? 0;
          this.totalKills = progress.totalKills ?? 0;
        }
      }
      const fullGraph = await fetchStreets(null);
      this.graph = this._clipGraph(fullGraph, this.center, this.radius * 1.15);
      if (!this.graph || !this.graph.nodeList || this.graph.nodeList.length < 8) {
        throw new Error('Pocas calles en esta zona. Mové el círculo a otra manzana.');
      }
      this._drawStreets();
      this.homeNodeId = nearestNode(this.graph, this.center.lat, this.center.lng);
      if (!this.homeNodeId) {
        throw new Error('No se encontró una calle cerca del centro. Probá otra manzana.');
      }
      L.circleMarker([this.center.lat, this.center.lng], {
        radius: 10, color: '#2ecc71', fillColor: '#27ae60', fillOpacity: 0.9, weight: 3
      }).addTo(this.entityLayer).bindTooltip('Tu base', { permanent: false });
      document.getElementById('crosshair').classList.add('hidden');
      document.getElementById('select-overlay').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      document.getElementById('controls').classList.remove('hidden');
      if (this.areaCircle) {
        this.areaCircle.setStyle({ color: '#27ae60', fillColor: '#27ae60', fillOpacity: 0.05 });
      }
      this._bindUI();
      this.ready = true;
      updateHUD({ gold: this.gold, wave: this.wave, zombiesAlive: 0 });
      showToast('¡Listo! Colocá defensores y lanzá la oleada.');
      this.running = true;
      this._startAutoSave();
      this.lastTime = performance.now();
      requestAnimationFrame(ts => this._loop(ts));
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error cargando calles', 5000);
      btn.disabled = false;
      btn.textContent = 'Jugar en esta manzana';
    }
  }

  _initMap() {
    this.map = L.map('map', { zoomControl: true, attributionControl: true }).setView([this.center.lat, this.center.lng], 18);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(this.map);
    this.streetLayer = L.layerGroup().addTo(this.map);
    this.entityLayer = L.layerGroup().addTo(this.map);
    setTimeout(() => this.map.invalidateSize(), 100);
  }

  _getBBox() {
    const deltaLat = this.radius / 111000;
    const deltaLng = this.radius / (111000 * Math.cos(this.center.lat * Math.PI / 180));
    return [
      this.center.lat - deltaLat, this.center.lng - deltaLng,
      this.center.lat + deltaLat, this.center.lng + deltaLng
    ];
  }

  _drawStreets() {
    this.streetLayer.clearLayers();
    for (const way of this.graph.ways) {
      L.polyline(way.coords, { color: '#555', weight: 4, opacity: 0.75 }).addTo(this.streetLayer);
    }
  }

  _bindUI() {
    document.querySelectorAll('.btn.tool').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn.tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tool = btn.dataset.tool;
      });
    });
    document.getElementById('btn-next-wave').addEventListener('click', () => this.startWave());
    this.map.on('click', (e) => this._onMapClick(e));
  }

  _onMapClick(e) {
    if (!this.ready || !this.graph) {
      showToast('Todavía no se cargaron las calles');
      return;
    }
    const { lat, lng } = e.latlng;
    if (this.tool === 'defender') this._placeDefender(lat, lng);
    else if (this.tool === 'barricade') this._placeBarricade(lat, lng);
  }

  _placeDefender(lat, lng) {
    if (this.gold < COST_DEFENDER) { showToast('Oro insuficiente'); return; }
    const nodeId = nearestNode(this.graph, lat, lng);
    if (!nodeId) { showToast('Tocá cerca de una calle'); return; }
    const node = this.graph.nodes.get(nodeId);
    for (const d of this.defenders) {
      if (this._dist(d.lat, d.lng, node.lat, node.lng) < 25) {
        showToast('Muy cerca de otro defensor');
        return;
      }
    }
    this.gold -= COST_DEFENDER;
    this._markDirty();
    updateHUD({ gold: this.gold });
    const marker = L.circleMarker([node.lat, node.lng], {
      radius: 9, color: '#fff', fillColor: '#ecf0f1', fillOpacity: 1, weight: 3
    }).addTo(this.entityLayer);
    this.defenders.push({
      lat: node.lat, lng: node.lng, nodeId, marker,
      cooldown: 0, range: DEFENDER_RANGE, damage: DEFENDER_DAMAGE
    });
    showToast('Defensor colocado');
  }

  _placeBarricade(lat, lng) {
    if (this.gold < COST_BARRICADE) { showToast('Oro insuficiente'); return; }
    const nodeId = nearestNode(this.graph, lat, lng);
    if (!nodeId) { showToast('Tocá cerca de una calle'); return; }
    const node = this.graph.nodes.get(nodeId);
    this.gold -= COST_BARRICADE;
    this._markDirty();
    updateHUD({ gold: this.gold });
    const marker = L.circleMarker([node.lat, node.lng], {
      radius: 8, color: '#e67e22', fillColor: '#d35400', fillOpacity: 0.9, weight: 2
    }).addTo(this.entityLayer);
    this.barricades.push({ lat: node.lat, lng: node.lng, nodeId, marker, hp: 100 });
    showToast('Barricada colocada');
  }

  startWave() {
    if (!this.ready || !this.graph) return;
    if (this.zombies.length > 0) { showToast('Todavía hay zombies vivos'); return; }
    this.wave++;
    if (this.wave > this.bestWave) this.bestWave = this.wave;
    this._markDirty();
    updateHUD({ wave: this.wave });
    const count = 4 + this.wave * 3;
    const spawnNodes = this._getEdgeNodes(count);
    for (let i = 0; i < count; i++) {
      const startId = spawnNodes[i % spawnNodes.length];
      const path = findPath(this.graph, startId, this.homeNodeId);
      if (!path || path.length < 2) continue;
      const cleanPath = path.filter(nid => !this.barricades.some(b => b.nodeId === nid));
      if (cleanPath.length < 2) continue;
      const startNode = this.graph.nodes.get(cleanPath[0]);
      const marker = L.circleMarker([startNode.lat, startNode.lng], {
        radius: 7, color: '#c0392b', fillColor: '#e74c3c', fillOpacity: 1, weight: 2
      }).addTo(this.entityLayer);
      this.zombies.push({
        path: cleanPath, pathIndex: 0,
        lat: startNode.lat, lng: startNode.lng, marker,
        hp: 40 + this.wave * 8, maxHp: 40 + this.wave * 8,
        speed: ZOMBIE_SPEED * (0.85 + Math.random() * 0.3)
      });
    }
    updateHUD({ zombiesAlive: this.zombies.length });
    showToast(`Oleada ${this.wave} – ${this.zombies.length} zombies`);
  }

  _getEdgeNodes(needed) {
    const center = this.center;
    const scored = this.graph.nodeList.map(id => {
      const n = this.graph.nodes.get(id);
      return { id, d: this._dist(center.lat, center.lng, n.lat, n.lng) };
    });
    scored.sort((a, b) => b.d - a.d);
    return scored.slice(0, Math.max(needed, 12)).map(s => s.id);
  }

  _loop(timestamp) {
    if (!this.running) return;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    this._updateZombies(dt);
    this._updateDefenders(dt);
    requestAnimationFrame(ts => this._loop(ts));
  }

  _updateZombies(dt) {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.hp <= 0) {
        z.marker.remove();
        this.zombies.splice(i, 1);
        this.gold += 12 + Math.floor(this.wave * 1.5);
        this.totalKills++;
        this._markDirty();
        updateHUD({ gold: this.gold, zombiesAlive: this.zombies.length });
        continue;
      }
      if (z.pathIndex >= z.path.length - 1) {
        z.marker.remove();
        this.zombies.splice(i, 1);
        this.gold = Math.max(0, this.gold - 15);
        this._markDirty();
        updateHUD({ gold: this.gold, zombiesAlive: this.zombies.length });
        showToast('¡Un zombie llegó a la base!');
        continue;
      }
      const nextId = z.path[z.pathIndex + 1];
      const nextNode = this.graph.nodes.get(nextId);
      if (!nextNode) { z.pathIndex++; continue; }
      const dist = this._dist(z.lat, z.lng, nextNode.lat, nextNode.lng);
      const step = z.speed * dt;
      if (step >= dist) {
        z.lat = nextNode.lat; z.lng = nextNode.lng; z.pathIndex++;
      } else {
        const t = step / dist;
        z.lat += (nextNode.lat - z.lat) * t;
        z.lng += (nextNode.lng - z.lng) * t;
      }
      z.marker.setLatLng([z.lat, z.lng]);
    }
  }

  _updateDefenders(dt) {
    for (const d of this.defenders) {
      d.cooldown -= dt;
      if (d.cooldown > 0) continue;
      let target = null;
      let bestDist = d.range;
      for (const z of this.zombies) {
        const dist = this._dist(d.lat, d.lng, z.lat, z.lng);
        if (dist < bestDist) { bestDist = dist; target = z; }
      }
      if (target) {
        target.hp -= d.damage;
        d.cooldown = DEFENDER_COOLDOWN;
        d.marker.setStyle({ fillColor: '#f1c40f' });
        setTimeout(() => d.marker.setStyle({ fillColor: '#ecf0f1' }), 120);
      }
    }
  }

  _markDirty() { this._dirty = true; }

  _startAutoSave() {
    if (!this.firebaseEnabled) return;
    this._saveTimer = setInterval(() => {
      if (this._dirty) this._save();
    }, 25000);
    window.addEventListener('beforeunload', () => {
      if (this._dirty) this._save();
    });
  }

  async _save() {
    if (!isFirebaseReady()) return;
    const data = {
      gold: this.gold, bestWave: this.bestWave, totalKills: this.totalKills,
      lastLat: this.center.lat, lastLng: this.center.lng
    };
    const ok = await saveProgress(data);
    if (ok) {
      this._dirty = false;
      await saveLeaderboardEntry({ bestWave: this.bestWave, totalKills: this.totalKills });
    }
  }

  _clipGraph(full, center, radiusM) {
    const keep = new Set();
    for (const id of full.nodeList) {
      const n = full.nodes.get(id);
      if (this._dist(center.lat, center.lng, n.lat, n.lng) <= radiusM) keep.add(id);
    }
    const graph = { nodes: new Map(), ways: [], nodeList: [] };
    for (const id of keep) {
      const src = full.nodes.get(id);
      const neighbors = new Map();
      for (const [nid, dist] of src.neighbors) {
        if (keep.has(nid)) neighbors.set(nid, dist);
      }
      graph.nodes.set(id, { lat: src.lat, lng: src.lng, neighbors });
      if (neighbors.size > 0) graph.nodeList.push(id);
    }
    for (const way of full.ways) {
      const coords = way.coords.filter(([lat, lng]) =>
        this._dist(center.lat, center.lng, lat, lng) <= radiusM * 1.05
      );
      if (coords.length >= 2) graph.ways.push({ id: way.id, coords });
    }
    return graph;
  }

  _dist(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
}
