const fs = require('fs');
const path = require('path');
const { generateHexMap } = require('../map/hex');

const biomes = ['Desert','Green','Ice','Lost','Lunar','Red','Swamp','Volcanic'];
const outRoot = path.join(__dirname, '..', 'maps', 'generated');

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
ensureDir(outRoot);

function serialize(gen) {
  const cells = [];
  const { cols, rows } = gen;
  for (let r = 0; r < rows; r++) {
    const row = new Array(cols).fill(1); // 1 ground
    for (let q = 0; q < cols; q++) {
      const k = `${q},${r}`;
      if (gen.blocked.has(k)) row[q] = 2; // obstacle
    }
    cells.push(row);
  }
  for (const t of gen.traps) {
    if (cells[t.r] && typeof cells[t.r][t.q] !== 'undefined') cells[t.r][t.q] = 4; // trap
  }
  for (const t of gen.tasks) {
    if (cells[t.r] && typeof cells[t.r][t.q] !== 'undefined') cells[t.r][t.q] = 3; // task
  }
  return {
    cols: gen.cols, rows: gen.rows, tileSize: gen.tileSize, biome: gen.biome,
    legend: { 1: 'ground', 2: 'obstacle', 3: 'task', 4: 'trap' },
    cells
  };
}

function main() {
  const cols = Number(process.env.MAP_COLS || 100);
  const rows = Number(process.env.MAP_ROWS || 100);
  const obstacleRatio = Number(process.env.MAP_OBS || 0.18);
  const trapRatio = Number(process.env.MAP_TRAP || 0.04);
  const taskRatio = Number(process.env.MAP_TASK || 0.03);
  const tileSize = Number(process.env.MAP_TILE || 32);
  const perBiome = Number(process.env.MAP_PER || 2);

  for (const biome of biomes) {
    const bdir = path.join(outRoot, biome);
    ensureDir(bdir);
    for (let i = 1; i <= perBiome; i++) {
      const gen = generateHexMap({ cols, rows, obstacleRatio, trapRatio, taskRatio, tileSize, biome });
      const data = serialize(gen);
      const file = path.join(bdir, `variant-${i}.json`);
      fs.writeFileSync(file, JSON.stringify(data));
      console.log('generated', file);
    }
  }
}

main();

