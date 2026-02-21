const SQRT3 = Math.sqrt(3);

export function offsetToPixel(col, row, tileSize, ox = 0, oy = 0) {
  const x = tileSize * Math.sqrt(3) * (col + 0.5 * (row & 1)) + ox;
  const y = tileSize * 1.5 * row + oy;
  return { x, y };
}

export function toPixel(q, r, tileSize, ox = 0, oy = 0) {
  // Axial to Pixel
  // x = size * sqrt(3) * (q + r/2)
  // y = size * 3/2 * r
  const x = tileSize * Math.sqrt(3) * (q + r / 2) + ox;
  const y = tileSize * 1.5 * r + oy;
  return { x, y };
}

export function getPixelSize(cols, rows, tileSize, ox = 0, oy = 0) {
  // Rectangular size for Odd-r Offset grid
  const width = Math.ceil(tileSize * Math.sqrt(3) * (cols + 0.5) + ox * 2);
  const height = Math.ceil(tileSize * (1.5 * rows + 0.5) + oy * 2);
  return { width, height };
}

export function hexCorners(x, y, tileSize) {
  const a = (Math.PI / 180) * 30;
  const r = tileSize;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const ang = a + i * Math.PI / 3;
    pts.push({ x: x + r * Math.cos(ang), y: y + r * Math.sin(ang) });
  }
  return pts;
}

export function pixelToHex(x, y, tileSize, ox = 0, oy = 0) {
  const x_eff = x - ox
  const y_eff = y - oy
  const q = (Math.sqrt(3)/3 * x_eff - 1/3 * y_eff) / tileSize
  const r = (2/3 * y_eff) / tileSize
  return axialRound(q, r)
}

export function axialRound(x, y) {
  const z = -x - y
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)
  
  const x_diff = Math.abs(rx - x)
  const y_diff = Math.abs(ry - y)
  const z_diff = Math.abs(rz - z)
  
  if (x_diff > y_diff && x_diff > z_diff) {
    rx = -ry - rz
  } else if (y_diff > z_diff) {
    ry = -rx - rz
  }
  
  return { q: rx, r: ry }
}

export function axialToOffset(q, r) {
  const col = q + (r - (r&1)) / 2
  const row = r
  return { col, row }
}

