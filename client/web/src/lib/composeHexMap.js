import { offsetToPixel, getPixelSize } from './hexMath.js';
import * as PIXI from 'pixi.js';

// Set default scale mode to NEAREST for pixel art clarity
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;

function biomeColors(biome) {
  switch (biome) {
    case 'Desert': return { ground: 0xc2a76d, obstacle: 0x6b5a3a, mineral: 0xf59e0b };
    case 'Green': return { ground: 0x6fbf6f, obstacle: 0x2f5f2f, mineral: 0xfbbf24 };
    case 'Ice': return { ground: 0xb6d7e6, obstacle: 0x5b7a8f, mineral: 0x38bdf8 };
    case 'Lunar': return { ground: 0xc3c6cf, obstacle: 0x505a66, mineral: 0xeab308 };
    case 'Red': return { ground: 0xd36a6a, obstacle: 0x7a2e2e, mineral: 0xfb7185 };
    case 'Swamp': return { ground: 0x6b8f73, obstacle: 0x2e3f33, mineral: 0x84cc16 };
    case 'Volcanic': return { ground: 0x8b5a4a, obstacle: 0x3a2a2a, mineral: 0xf97316 };
    case 'Lost': 
    default: return { ground: 0x9aa0a6, obstacle: 0x4b5563, mineral: 0xf59e0b };
  }
}

const textureCache = new Map();

function imgUrl(biome, category, name) {
  return `/assets/hex/${biome}/${category}/${name}.png`;
}

function range(n) { return Array.from({ length: n }, (_, i) => i + 1); }

export async function preloadCategory(biome, category) {
  const key = `${biome}:${category}`;
  if (textureCache.has(key)) return textureCache.get(key);
  
  const textures = new Map();
  let start = 1, end = 10;
  
  if (category === 'ground') {
    start = 1; end = 10;
  } else if (category === 'obstacle') {
    start = 11; end = 20;
  } else if (category === 'mineral') {
    start = 21; end = 30;
  }
  
  const promises = [];
  for (let i = start; i <= end; i++) {
      const name = String(i);
      const url = imgUrl(biome, category, name);
      promises.push(
          PIXI.Assets.load(url)
            .then(tex => {
                if (tex) textures.set(i, tex);
            })
            .catch(() => {
                // ignore 404
            })
      );
  }
  
  await Promise.all(promises);

  textureCache.set(key, textures);
  return textures;
}

function pickStable(map, c, r, startId, endId) {
  if (!map || map.size === 0) return null;
  // Create a list of available IDs in this map
  const ids = Array.from(map.keys()).sort((a,b) => a-b);
  if (ids.length === 0) return null;
  
  const h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
  const id = ids[h % ids.length];
  return map.get(id);
}

export async function composeHexMapSprite(map) {
  // Returns a Container with hex sprites
  const { cols, rows, tileSize, biome, cells } = map;
  const container = new PIXI.Container();
  
  // Preload textures
  const [groundMap, obstacleMap, mineralMap] = await Promise.all([
    preloadCategory(biome, 'ground'),
    preloadCategory(biome, 'obstacle'),
    preloadCategory(biome, 'mineral'),
  ]);
  
  // Helper to get texture by ID
  const getTexture = (id) => {
      // Check if ID is in specific maps
      if (groundMap && groundMap.has(id)) return groundMap.get(id);
      if (obstacleMap && obstacleMap.has(id)) return obstacleMap.get(id);
      if (mineralMap && mineralMap.has(id)) return mineralMap.get(id);
      
      // Legacy / Range Fallbacks
      if (id >= 1 && id <= 10) return pickStable(groundMap, 0, 0);
      if (id >= 11 && id <= 20) return pickStable(obstacleMap, 0, 0);
      if (id >= 21 && id <= 30) return pickStable(mineralMap, 0, 0);
      if (id >= 31 && id <= 40) return pickStable(mineralMap, 0, 0);
      
      return null;
  }

  const hexW = Math.sqrt(3) * tileSize;
  const hexH = 2 * tileSize;
  
  // We want to scale sprites to match hex size.
  // Assuming sprite is square-ish and should fit in hexH x hexH box?
  // Or match width?
  // Usually hex tiles are square textures.
  // If texture is 32x32 and tileSize is 32, hexW is 55.4.
  // We should scale texture to cover the hex.
  // Let's assume texture is meant to be drawn at hexW x hexH size.
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = cells[r][c]; // offset coords
      const { x, y } = offsetToPixel(c, r, tileSize);
      
      let tex = getTexture(v);
      
      // If tex is null but ID is valid range (e.g. file missing), use fallback from category
      if (!tex) {
          if (v >= 1 && v <= 10) tex = pickStable(groundMap, c, r);
          else if (v >= 11 && v <= 20) tex = pickStable(obstacleMap, c, r);
          else if (v >= 21 && v <= 30) tex = pickStable(mineralMap, c, r);
          else if (v >= 31 && v <= 40) tex = pickStable(mineralMap, c, r);
          // else legacy
          else if (v === 1) tex = pickStable(groundMap, c, r);
          else if (v === 2) tex = pickStable(obstacleMap, c, r);
      }
      
      if (tex) {
        const sprite = new PIXI.Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.x = x;
        sprite.y = y;
        
        // Calculate scale to fit the hex
        // Hex width (point to point) is 2 * tileSize
        // Hex height (flat to flat) is sqrt(3) * tileSize
        // But for flat-topped hexes (which seems to be the case if we use odd-r/even-r offset):
        // Width = sqrt(3) * size
        // Height = 2 * size
        
        // Ensure scale mode is nearest for clarity
        tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

        // Force dimensions to avoid black artifacts if texture is weird?
        // Actually, if we force width/height and texture is small, it stretches.
        // If "black square" means the transparent background is black, it's an alpha issue.
        // Let's try to trust the texture size if it matches hexW/hexH roughly,
        // or scale it proportionally.
        
        // Just force size for now but log if texture is missing
        sprite.width = hexW;
        sprite.height = hexH;
        
        container.addChild(sprite);
      } else {
        const colors = biomeColors(biome);
        const g = new PIXI.Graphics();
        let color = colors.ground;
        if (v === 2) color = colors.obstacle;
        else if (v === 3) color = colors.mineral;
        else if (v >= 11 && v <= 20) color = colors.obstacle;
        else if ((v >= 21 && v <= 30) || (v >= 31 && v <= 40)) color = colors.mineral;
        
        g.beginFill(color);
        // Draw hex
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const ang = (Math.PI / 180) * (30 + i * 60);
            pts.push({ x: Math.cos(ang) * tileSize, y: Math.sin(ang) * tileSize });
        }
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < 6; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.endFill();
        g.x = x;
        g.y = y;
        container.addChild(g);
      }
    }
  }
  
  return container;
}
