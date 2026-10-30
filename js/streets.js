/**
 * Descarga calles de OpenStreetMap vía Overpass API
 * y construye un grafo simple para pathfinding.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export async function fetchStreets(bbox) {
  const [south, west, north, east] = bbox;

  const query = `
    [out:json][timeout:25];
    (
      way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|service|footway|path|pedestrian|track)$"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: query
  });

  if (!response.ok) {
    throw new Error(`Overpass error: ${response.status}`);
  }

  const data = await response.json();
  return parseOverpassToGraph(data);
}

function parseOverpassToGraph(data) {
  const nodes = new Map();
  const ways = [];

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lng: el.lon });
    }
  }

  for (const el of data.elements) {
    if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      const coords = [];
      for (const nid of el.nodes) {
        const n = nodes.get(nid);
        if (n) coords.push([n.lat, n.lng]);
      }
      if (coords.length >= 2) {
        ways.push({ id: el.id, nodes: el.nodes, coords });
      }
    }
  }

  const graph = {
    nodes: new Map(),
    ways,
    nodeList: []
  };

  for (const [id, pos] of nodes) {
    graph.nodes.set(id, {
      lat: pos.lat,
      lng: pos.lng,
      neighbors: new Map()
    });
  }

  for (const way of ways) {
    for (let i = 0; i < way.nodes.length - 1; i++) {
      const a = way.nodes[i];
      const b = way.nodes[i + 1];
      const na = graph.nodes.get(a);
      const nb = graph.nodes.get(b);
      if (!na || !nb) continue;

      const dist = haversine(na.lat, na.lng, nb.lat, nb.lng);
      na.neighbors.set(b, dist);
      nb.neighbors.set(a, dist);
    }
  }

  for (const [id, node] of graph.nodes) {
    if (node.neighbors.size > 0) {
      graph.nodeList.push(id);
    }
  }

  return graph;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
