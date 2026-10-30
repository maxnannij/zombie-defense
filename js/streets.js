/**
 * Calles offline precargadas (Buenos Aires) + pathfinding.
 * No depende de Overpass ni de GPS.
 */

let cachedGraph = null;

export async function fetchStreets(_bboxIgnored) {
  if (cachedGraph) return cachedGraph;

  const response = await fetch('data/ba-streets.json');
  if (!response.ok) {
    throw new Error('No se pudo cargar el mapa local de Buenos Aires');
  }

  const data = await response.json();
  cachedGraph = buildGraphFromLocal(data);
  return cachedGraph;
}

export async function getDefaultCenter() {
  try {
    const response = await fetch('data/ba-streets.json');
    const data = await response.json();
    if (data.meta?.center) {
      return { lat: data.meta.center[0], lng: data.meta.center[1] };
    }
  } catch (_) {}
  return { lat: -34.5075, lng: -58.4880 };
}

function buildGraphFromLocal(data) {
  const graph = {
    nodes: new Map(),
    ways: data.ways || [],
    nodeList: data.nodeList || []
  };

  for (const [id, pos] of Object.entries(data.nodes || {})) {
    graph.nodes.set(id, {
      lat: pos.lat,
      lng: pos.lng,
      neighbors: new Map()
    });
  }

  for (const [a, b, dist] of data.edges || []) {
    const na = graph.nodes.get(a);
    const nb = graph.nodes.get(b);
    if (!na || !nb) continue;
    na.neighbors.set(b, dist);
    nb.neighbors.set(a, dist);
  }

  if (graph.nodeList.length === 0) {
    graph.nodeList = [...graph.nodes.keys()].filter(
      id => graph.nodes.get(id).neighbors.size > 0
    );
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
        open.set(neighborId, {
          g: tentativeG,
          f: tentativeG + h
        });
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
