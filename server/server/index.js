const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config();
const { Server, matchMaker } = require('colyseus');
const { CrustaceanRoom } = require('./rooms/CrustaceanRoom');
const { createPool } = require('./db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 2567;

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/maps', express.static(path.join(__dirname, 'maps', 'generated')));
  const mapsRoot = path.join(__dirname, 'maps', 'generated');
  const availableMaps = [];
  (function scan(dir) {
    try {
      const items = require('fs').readdirSync(dir, { withFileTypes: true });
      for (const it of items) {
        const p = path.join(dir, it.name);
        if (it.isDirectory()) scan(p);
        else if (it.isFile() && p.toLowerCase().endsWith('.json')) {
          const rel = path.relative(mapsRoot, p).split(path.sep).join('/');
          availableMaps.push('/maps/' + rel);
        }
      }
    } catch {}
  })(mapsRoot);
  app.locals.availableMaps = availableMaps;
  const pool = createPool();
  app.locals.db = pool;
  if (pool) {
    await ensureClaimColumns(pool);
  }
  const MM_BATCH = 8;
  const mmQueue = []; // array of ticket strings
  const mmTickets = new Map(); // ticket -> { status, roomId?, error? }
  let mmProcessing = false;
  async function processQueue() {
    if (mmProcessing) return;
    mmProcessing = true;
    try {
      while (mmQueue.length >= MM_BATCH) {
        const batch = mmQueue.splice(0, MM_BATCH);
        try {
          // Filter maps to only include those named mapN.json in Desert folder (or generally)
          // The user requested random selection from map1.json, map2.json...
          // Current availableMaps contains paths like "/maps/Desert/map1.json"
          
          const validMaps = availableMaps.filter(m => {
              const basename = path.basename(m);
              return /^map\d+\.json$/i.test(basename);
          });
          
          const maps = validMaps.length > 0 ? validMaps : availableMaps;
          const mp = maps.length > 0 ? maps[Math.floor(Math.random() * maps.length)] : undefined;
          
          console.log(`[MatchMaker] Creating room with map: ${mp}`);
          const room = await matchMaker.createRoom('lobster', mp ? { mapPath: mp } : {});
          batch.forEach(t => mmTickets.set(t, { status: 'ready', roomId: room.roomId }));
        } catch (e) {
          batch.forEach(t => mmTickets.set(t, { status: 'error', error: e.message || 'create_room_failed' }));
        }
      }
    } finally {
      mmProcessing = false;
    }
  }

  app.get('/', (req, res) => {
    res.json({ name: 'AIGame Server', status: 'ok' });
  });

  app.get('/rooms', async (req, res) => {
    console.log('[API] GET /rooms request received');
    try {
      const all = await matchMaker.query({});
      console.log(`[API] Found ${all.length} rooms`);
      const rooms = all.map(r => ({
        roomId: r.roomId,
        name: r.name,
        clients: r.clients,
        maxClients: r.maxClients,
        metadata: r.metadata || {}
      }));
      res.json({ rooms });
    } catch (e) {
      console.error('[API] GET /rooms error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/matchmaking/join', async (req, res) => {
    const ticket = crypto.randomBytes(12).toString('hex');
    mmTickets.set(ticket, { status: 'queued' });
    mmQueue.push(ticket);
    processQueue();
    res.json({ ticket });
  });

  app.get('/api/matchmaking/status', (req, res) => {
    const ticket = req.query.ticket;
    if (!ticket) return res.status(400).json({ error: 'missing ticket' });
    const info = mmTickets.get(ticket);
    if (!info) return res.status(404).json({ error: 'not_found' });
    res.json(info);
  });

  app.post('/api/register', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'database unavailable' });
    try {
      const { username, email, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'username and password required' });
      const hash = await bcrypt.hash(password, 10);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ures = await client.query(
          'INSERT INTO app_user (username, email, password_hash, auth_provider) VALUES ($1, $2, $3, $4) RETURNING id, username, email',
          [username, email || null, hash, 'local']
        );
        const user = ures.rows[0];
        const apiKey = crypto.randomBytes(24).toString('hex');
        const claimToken = crypto.randomBytes(24).toString('hex');
        const verificationCode = 'reef-' + crypto.randomBytes(2).toString('hex').toUpperCase();
        await client.query(
          'INSERT INTO agent (user_id, name, api_key, claimed, claim_token, verification_code) VALUES ($1, $2, $3, $4, $5, $6)',
          [user.id, username, apiKey, false, claimToken, verificationCode]
        );
        await client.query('COMMIT');
        const base = req.protocol + '://' + req.get('host');
        const claimUrl = base + '/claim/' + claimToken;
        return res.json({ user, apiKey, claim_url: claimUrl, verification_code: verificationCode });
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') {
          return res.status(409).json({ error: 'username or email already exists' });
        }
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('[api/register] error', e);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.get('/api/agents/status', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'database unavailable' });
    try {
      const bearer = req.get('authorization');
      let apiKey = req.query.api_key;
      if (!apiKey && bearer && bearer.toLowerCase().startsWith('bearer ')) {
        apiKey = bearer.slice(7).trim();
      }
      if (!apiKey) return res.status(400).json({ error: 'missing api_key' });
      const q = await pool.query('SELECT claimed FROM agent WHERE api_key = $1', [apiKey]);
      if (q.rowCount === 0) return res.status(404).json({ error: 'not_found' });
      const status = q.rows[0].claimed ? 'active' : 'pending_claim';
      res.json({ status, claimed: q.rows[0].claimed });
    } catch (e) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.get('/api/agents/me', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'database unavailable' });
    try {
      const bearer = req.get('authorization');
      if (!bearer || !bearer.toLowerCase().startsWith('bearer ')) return res.status(401).json({ error: 'missing_bearer' });
      const apiKey = bearer.slice(7).trim();
      const q = await pool.query('SELECT id, user_id, name, api_key, claimed FROM agent WHERE api_key = $1', [apiKey]);
      if (q.rowCount === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ agent: q.rows[0] });
    } catch (e) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/agents/claim', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'database unavailable' });
    try {
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ error: 'missing token' });
      const q = await pool.query('UPDATE agent SET claimed = TRUE WHERE claim_token = $1 RETURNING id, claimed', [token]);
      if (q.rowCount === 0) return res.status(404).json({ error: 'invalid_token' });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.get('/claim/:token', async (req, res) => {
    if (!pool) return res.status(503).send('database unavailable');
    try {
      const token = req.params.token;
      const q = await pool.query('UPDATE agent SET claimed = TRUE WHERE claim_token = $1 AND claimed = FALSE RETURNING id', [token]);
      if (q.rowCount === 0) return res.status(404).send('Invalid or already claimed');
      const html = '<html><body><h1>Agent Claimed</h1><p>Your agent is now active.</p></body></html>';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send('internal error');
    }
  });

  const server = http.createServer(app);
  const gameServer = new Server({ server });

  gameServer.define('lobster', CrustaceanRoom);

  gameServer.listen(PORT);
  console.log(`[server] listening at ws://localhost:${PORT}`);

  // REMOVED: Default room creation
  // We want rooms to be created only when players matchmake.
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function ensureClaimColumns(pool) {
  const client = await pool.connect();
  try {
    await client.query('ALTER TABLE agent ADD COLUMN IF NOT EXISTS claimed BOOLEAN NOT NULL DEFAULT FALSE');
    await client.query('ALTER TABLE agent ADD COLUMN IF NOT EXISTS claim_token TEXT UNIQUE');
    await client.query('ALTER TABLE agent ADD COLUMN IF NOT EXISTS verification_code TEXT');
  } finally {
    client.release();
  }
}
