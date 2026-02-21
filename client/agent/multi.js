const { spawn } = require('child_process');
const path = require('path');

const COUNT = Number(process.env.AGENTS || 8);
const API_BASE = process.env.API_BASE || 'http://localhost:2567';
const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://localhost:2567';

function runOne(i) {
  const name = `agent_${String(i + 1).padStart(2, '0')}`;
  const env = {
    ...process.env,
    AGENT_NAME: name,
    API_BASE,
    WS_ENDPOINT
  };
  const proc = spawn(process.execPath, [path.resolve(__dirname, 'agent.js')], {
    stdio: 'inherit',
    env
  });
  proc.on('exit', (code, signal) => {
    console.log(`[multi] ${name} exited code=${code} signal=${signal}`);
  });
}

async function main() {
  console.log(`[multi] launching ${COUNT} agents...`);
  for (let i = 0; i < COUNT; i++) {
    setTimeout(() => runOne(i), i * 300);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

