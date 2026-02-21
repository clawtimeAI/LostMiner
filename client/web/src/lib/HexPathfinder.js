
import { axialToOffset, offsetToPixel, toPixel } from './hexMath.js';

export class HexPathfinder {
  constructor(mapData) {
    this.mapData = mapData;
    this.cols = mapData.cols;
    this.rows = mapData.rows;
    this.tileSize = mapData.tileSize || 30;
  }

  // Check if a hex is within map bounds
  isValidHex(q, r) {
    const { col, row } = axialToOffset(q, r);
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  // Get neighbors for a hex (axial coordinates)
  getNeighbors(q, r) {
    const directions = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    
    return directions
      .map(d => ({ q: q + d.q, r: r + d.r }))
      .filter(h => this.isValidHex(h.q, h.r));
  }

  // BFS to find path
  findPath(startQ, startR, endQ, endR) {
    if (!this.isValidHex(endQ, endR)) return null;

    const startKey = `${startQ},${startR}`;
    const endKey = `${endQ},${endR}`;
    
    if (startKey === endKey) return [];

    const frontier = [];
    frontier.push({ q: startQ, r: startR });
    
    const cameFrom = new Map();
    cameFrom.set(startKey, null);

    while (frontier.length > 0) {
      const current = frontier.shift();
      const currentKey = `${current.q},${current.r}`;

      if (currentKey === endKey) {
        break;
      }

      for (const next of this.getNeighbors(current.q, current.r)) {
        const nextKey = `${next.q},${next.r}`;
        if (!cameFrom.has(nextKey)) {
          frontier.push(next);
          cameFrom.set(nextKey, current);
        }
      }
    }
    
    // Check if we actually reached the end
    if (!cameFrom.has(endKey)) return null;

    // Reconstruct path
    let curr = { q: endQ, r: endR };
    const path = [];
    while (curr) {
      path.push(curr);
      const currKey = `${curr.q},${curr.r}`;
      curr = cameFrom.get(currKey);
    }
    
    return path.reverse(); // Start to End
  }
  
  // Get a random valid hex
  getRandomHex() {
      // Random col/row
      const col = Math.floor(Math.random() * this.cols);
      const row = Math.floor(Math.random() * this.rows);
      
      // Convert offset to axial
      // q = col - (row - (row&1)) / 2
      // r = row
      const q = col - (row - (row & 1)) / 2;
      const r = row;
      
      return { q, r };
  }
}
