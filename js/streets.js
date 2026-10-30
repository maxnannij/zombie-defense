/**
 * Mapa offline de Buenos Aires (grilla de manzanas).
 * Se genera en el cliente: no Overpass, no GPS, no archivo externo.
 */

const DEFAULT_CENTER = { lat: -34.5075, lng: -58.4880 };

let cachedGraph = null;

export async function getDefaultCenter() {
  return { ...DEFAULT_CENTER };
}

export async function fetchStreets(_bboxIgnored) {
  if (cachedGraph) return cachedGraph;
  cachedGraph = buildGridGraph(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, 700, 100);
  return cachedGraph;
}

function buildGridGraph(centerLat, centerLng, halfMeters, blockMeters) {
  const mToLat = 1 / 111000;
  const mToLng = 1 / (111000 * Math.cos((centerLat * Math.PI) / 180));
  const n = Math.floor((2 * halfMeters) / blockMeters) + 1;

  const graph = {
    nodes: new Map(),
    ways: [],
    nodeList: []
  };

  const nid = (i, j) => `n${i}_${j}`;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dy = -halfMeters + i * blockMeters;
      const dx = -halfMeters + j * blockMeters;
      const lat = centerLat + dy * mToLat;
      const lng = centerLng + dx * mToLng;
      const id = nid(i, j);
      graph.nodes.set(id, { lat, lng, neighbors: new Map() });
      graph.nodeList.push(id);
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = nid(i, j);
      const na = graph.nodes.get(a);
      if (j + 1 < n) {
        const b = nid(i, j + 1);
        na.neighbors.set(b, blockMeters);
        graph.nodes.get(b).neighbors.set(a, blockMeters);
      }
      if (i + 1 < n) {
        const b = nid(i + 1, j);
        na.neighbors.set(b, blockMeters);
        graph.nodes.get(b).neighbors.set(a, blockMeters);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const coords = [];
    for (let j = 0; j < n; j++) {
      const node = graph.nodes.get(nid(i, j));
      coords.push([node.lat, node.lng]);
    }
    graph.ways.push({ id: `h${i}`, coords });
  }
  for (let j = 0; j < n; j++) {
    const coords = [];
    for (let i = 0; i < n; i++) {
      const node = graph.nodes.get(nid(i, j));
      coords.push([node.lat, node.lng]);
    }
    graph.ways.push({ id: `v${j}`, coords });
  }

  return graph;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findPath(graph, startId, goalId) {
  if (startId === goalId) return [startId];

  const open = new Map();
  const closed = new Set();
  const cameFrom = new Map();

  const startNode = graph.nodes.get(startId);
  const goalNode = graph.nodes.get(goalId);
  if (!startNode || !goalNode) return null;

  open.set(startId, {
    g: 0,
    f: haversine(startNode.lat, startNode.lng, goalNode.lat, goalNode.lng)
  });
  cameFrom.set(startId, null);

  while (open.size > 0) {
    let currentId = null;
    let bestF = Infinity;
    for (const [id, data] of open) {
      if (data.f < bestF) {
        bestF = data.f;
        currentId = id;
      }
    }

    if (currentId === goalId) {
      const path = [];
      let id = currentId;
      while (id !== null) {
        path.push(id);
        id = cameFrom.get(id);
      }
      return path.reverse();
    }

    const current = open.get(currentId);
    open.delete(currentId);
    closed.add(currentId);

    const node = graph.nodes.get(currentId);
    for (const [neighborId, dist] of node.neighbors) {
      if (closed.has(neighborId)) continue;

      const tentativeG = current.g + dist;
      const existing = open.get(neighborId);

      if (!existing || tentativeG < existing.g) {
        const neighbor = graph.nodes.get(neighborId);
        const h = haversine(neighbor.lat, neighbor.lng, goalNode.lat, goalNode.lng);
        open.set(neighborId, { g: tentativeG, f: tentativeG + h });
        cameFrom.set(neighborId, currentId);
      }
    }
  }

  return null;
}

export function nearestNode(graph, lat, lng) {
  if (!graph || !graph.nodeList || graph.nodeList.length === 0) return null;

  let bestId = null;
  let bestDist = Infinity;

  for (const id of graph.nodeList) {
    const n = graph.nodes.get(id);
    const d = haversine(lat, lng, n.lat, n.lng);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}
