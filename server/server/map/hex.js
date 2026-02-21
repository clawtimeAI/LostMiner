const sqrt3 = Math.sqrt(3);

function toPixel(q, r, tileSize, ox = 0, oy = 0) {
  // Same as client: x = size * sqrt(3) * (q + r/2)
  const x = tileSize * sqrt3 * (q + r / 2) + ox;
  const y = tileSize * 1.5 * r + oy;
  return { x, y };
}

function offsetToAxial(col, row) {
  const q = col - (row - (row & 1)) / 2;
  const r = row;
  return { q, r };
}

function fromPixel(x, y, tileSize, ox = 0, oy = 0) {
  const px = x - ox;
  const py = y - oy;
  const q = (sqrt3 / 3 * px - 1 / 3 * py) / tileSize;
  const r = (2 / 3 * py) / tileSize;
  return cubeRound(axialToCube({ q, r }));
}

function axialToCube(a) {
  const x = a.q;
  const z = a.r;
  const y = -x - z;
  return { x, y, z };
}

function cubeToAxial(c) {
  return { q: c.x, r: c.z };
}

function cubeRound(c) {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);
  const xDiff = Math.abs(rx - c.x);
  const yDiff = Math.abs(ry - c.y);
  const zDiff = Math.abs(rz - c.z);
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return cubeToAxial({ x: rx, y: ry, z: rz });
}

const dirs = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function neighbors(a) {
  const out = [];
  for (const d of dirs) out.push({ q: a.q + d.q, r: a.r + d.r });
  return out;
}

function key(a) {
  return `${a.q},${a.r}`;
}

function heuristic(a, b) {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((-a.q - a.r) - (-b.q - b.r));
  return Math.max(dq, dr, ds);
}

function axialAStar(start, goal, blocked, bounds) {
  const startK = key(start);
  const goalK = key(goal);
  if (blocked.has(goalK)) return null;
  
  // Custom blocked logic: 
  // Obstacles are IDs 6-9
  // If we had the map data, we could check the ID.
  // But here 'blocked' is a Set of keys.
  // The caller must populate 'blocked' with all non-walkable hexes.
  // Ground (1-5) and Trap (10-12) might be walkable or not depending on game rules.
  // Typically Traps are walkable but dangerous.
  // Obstacles are not walkable.
  
  const open = new Map();
  const startObj = { a: start, g: 0, f: heuristic(start, goal) };
  open.set(startK, startObj);
  const came = new Map(); // key -> parent axial
  
  // Set to track visited nodes to avoid reprocessing
  const closed = new Set();

  while (open.size > 0) {
    let bestK = null, best = null;
    // Find node with lowest f score
    for (const [k, v] of open) {
      if (!best || v.f < best.f) { best = v; bestK = k; }
    }
    
    if (!best) break; // Should not happen if open.size > 0
    if (bestK === goalK) {
      // Reconstruct path
      const path = [];
      let curr = goalK;
      let safety = 0;
      while (curr) {
        if (safety++ > 5000) break; // Safety break
        
        // Parse current key back to axial coordinates
        const [q, r] = curr.split(',').map(Number);
        path.push({ q, r });
        
        if (curr === startK) break;
        
        const parent = came.get(curr);
        if (!parent) break; 
        curr = key(parent);
      }
      return path.reverse();
    }

    open.delete(bestK);
    closed.add(bestK);

    const nbs = neighbors(best.a);
    for (const nb of nbs) {
      const nk = key(nb);
      if (closed.has(nk)) continue;
      if (blocked.has(nk)) continue;

      // Bounds check: convert axial back to offset (col, row) to check against bounds.cols/rows
      // q = col - (row - (row&1)) / 2  => col = q + (row - (row&1)) / 2
      // r = row
      const row = nb.r;
      const col = nb.q + (row - (row & 1)) / 2;
      
      if (row < 0 || row >= bounds.rows || col < 0 || col >= bounds.cols) continue;

      const gScore = best.g + 1;
      const existing = open.get(nk);

      if (!existing || gScore < existing.g) {
        came.set(nk, best.a);
        open.set(nk, { a: nb, g: gScore, f: gScore + heuristic(nb, goal) });
      }
    }
  }
  return null;
}

module.exports = {
  toPixel,
  fromPixel,
  offsetToAxial,
  neighbors,
  axialAStar,
  heuristic,
};

