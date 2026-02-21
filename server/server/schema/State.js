const schema = require('@colyseus/schema');
const { Schema, MapSchema, ArraySchema, type } = schema;

class Player extends Schema {
  constructor() {
    super();
    this.team = 'blue';
    this.lastAction = 'idle';
    this.lastAt = Date.now();
    this.role = 'agent';
    this.x = 0;
    this.y = 0;
    // Hex coords (Axial)
    this.q = 0;
    this.r = 0;
    // Hex coords (Offset)
    this.col = 0;
    this.row = 0;
    // Movement target for interpolation
    this.targetQ = 0;
    this.targetR = 0;
    // Visuals
    this.monsterType = 'm1';
    
    this.alive = true;
    this.assignedTaskId = '';
    
    // Goose Goose Duck specific
    this.identity = 'goose'; // 'goose' or 'duck'
    this.state = 'idle'; // 'idle', 'moving', 'doing_task', 'dead', 'chasing'
    this.path = new ArraySchema(); // Current path to follow
    this.cooldowns = new MapSchema(); // Ability cooldowns
  }
}
type('string')(Player.prototype, 'team');
type('string')(Player.prototype, 'lastAction');
type('number')(Player.prototype, 'lastAt');
type('string')(Player.prototype, 'role');
type('number')(Player.prototype, 'x');
type('number')(Player.prototype, 'y');
type('number')(Player.prototype, 'q');
type('number')(Player.prototype, 'r');
type('number')(Player.prototype, 'col');
type('number')(Player.prototype, 'row');
type('number')(Player.prototype, 'targetQ');
type('number')(Player.prototype, 'targetR');
type('string')(Player.prototype, 'monsterType');
type('boolean')(Player.prototype, 'alive');
type('string')(Player.prototype, 'assignedTaskId');
type('string')(Player.prototype, 'identity');
type('string')(Player.prototype, 'state');
type(['string'])(Player.prototype, 'path'); // array of "q,r" strings
type({ map: 'number' })(Player.prototype, 'cooldowns');

class Message extends Schema {
  constructor() {
    super();
    this.senderId = '';
    this.team = '';
    this.text = '';
    this.at = Date.now();
  }
}
type('string')(Message.prototype, 'senderId');
type('string')(Message.prototype, 'team');
type('string')(Message.prototype, 'text');
type('number')(Message.prototype, 'at');

class Mineral extends Schema {
  constructor() {
    super();
    this.id = '';
    this.x = 0;
    this.y = 0;
    this.q = 0;
    this.r = 0;
    this.done = false;
    this.doneBy = '';
    this.type = 'ore';
    this.difficulty = 1;
    this.requiredWork = 3;
    this.work = 0;
    this.lockedBy = '';
    this.respawnAt = 0;
  }
}
type('string')(Mineral.prototype, 'id');
type('number')(Mineral.prototype, 'x');
type('number')(Mineral.prototype, 'y');
type('number')(Mineral.prototype, 'q');
type('number')(Mineral.prototype, 'r');
type('boolean')(Mineral.prototype, 'done');
type('string')(Mineral.prototype, 'doneBy');
type('string')(Mineral.prototype, 'type');
type('number')(Mineral.prototype, 'difficulty');
type('number')(Mineral.prototype, 'requiredWork');
type('number')(Mineral.prototype, 'work');
type('string')(Mineral.prototype, 'lockedBy');
type('number')(Mineral.prototype, 'respawnAt');

class Obstacle extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.w = 0;
    this.h = 0;
    this.kind = 'wall';
  }
}
type('number')(Obstacle.prototype, 'x');
type('number')(Obstacle.prototype, 'y');
type('number')(Obstacle.prototype, 'w');
type('number')(Obstacle.prototype, 'h');
type('string')(Obstacle.prototype, 'kind');

class State extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.tick = 0;
    this.phase = 'lobby';
    this.messages = new ArraySchema();
    this.minerals = new ArraySchema();
    this.width = 1600;
    this.height = 900;
    this.obstacles = new ArraySchema();
    this.winner = '';
    this.mineralsCollected = 0;
  }
  addPlayer(id, team, role = 'agent') {
    const p = new Player();
    p.team = team;
    p.role = role;
    p.x = Math.floor(Math.random() * this.width);
    p.y = Math.floor(Math.random() * this.height);
    this.players.set(id, p);
  }
  removePlayer(id) {
    this.players.delete(id);
  }
  countByTeam(team) {
    let n = 0;
    this.players.forEach(p => { if (p.team === team && p.role === 'agent') n++; });
    return n;
  }
  addMessage(senderId, team, text) {
    const m = new Message();
    m.senderId = senderId;
    m.team = team;
    m.text = text;
    m.at = Date.now();
    this.messages.push(m);
    if (this.messages.length > 100) {
      this.messages.shift();
    }
  }
  spawnMinerals(n = 6) {
    this.minerals.length = 0;
    const kinds = ['iron', 'gold', 'diamond', 'coal', 'emerald'];
    for (let i = 0; i < n; i++) {
      const m = new Mineral();
      m.id = `M${i + 1}`;
      m.type = kinds[i % kinds.length];
      m.difficulty = 1 + (i % 3);
      m.requiredWork = 2 + m.difficulty;
      const pos = this.randomFreePosition();
      m.x = pos.x;
      m.y = pos.y;
      m.done = false;
      m.work = 0;
      m.lockedBy = '';
      m.respawnAt = 0;
      this.minerals.push(m);
    }
  }
  spawnMap() {
    this.obstacles.length = 0;
    const add = (x, y, w, h, kind = 'wall') => {
      const o = new Obstacle();
      o.x = x; o.y = y; o.w = w; o.h = h; o.kind = kind;
      this.obstacles.push(o);
    };
    add(0, 0, this.width, 20);
    add(0, this.height - 20, this.width, 20);
    add(0, 0, 20, this.height);
    add(this.width - 20, 0, 20, this.height);
    add(400, 100, 40, 700);
    add(800, 100, 40, 700);
    add(1200, 200, 40, 500);
  }
  clampPlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.x < 0) p.x = 0;
    if (p.y < 0) p.y = 0;
    if (p.x > this.width) p.x = this.width;
    if (p.y > this.height) p.y = this.height;
  }
  isBlocked(x, y) {
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
    }
    return false;
  }
  randomFreePosition(maxTry = 50) {
    for (let i = 0; i < maxTry; i++) {
      const x = Math.floor(Math.random() * this.width);
      const y = Math.floor(Math.random() * this.height);
      if (!this.isBlocked(x, y)) return { x, y };
    }
    return { x: 50, y: 50 };
  }
  tryCompleteNearby(id, radius = 40) {
    const p = this.players.get(id);
    if (!p) return;
    for (let i = 0; i < this.minerals.length; i++) {
      const m = this.minerals[i];
      if (m.done) continue;
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      if ((dx * dx + dy * dy) <= radius * radius) {
        m.work = m.work + 1;
        if (m.work >= m.requiredWork) {
          m.done = true;
          m.doneBy = id;
        }
      }
    }
  }
}
type({ map: Player })(State.prototype, 'players');
type('number')(State.prototype, 'tick');
type('string')(State.prototype, 'phase');
type([ Message ])(State.prototype, 'messages');
type([ Mineral ])(State.prototype, 'minerals');
type('number')(State.prototype, 'width');
type('number')(State.prototype, 'height');
type([ Obstacle ])(State.prototype, 'obstacles');
type('string')(State.prototype, 'winner');
type('number')(State.prototype, 'mineralsCollected');

module.exports = { State, Player, Message, Mineral, Obstacle };
