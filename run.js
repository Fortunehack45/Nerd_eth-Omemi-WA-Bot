// ══════════════════════════════════════════════════════════════════════════
// 🛡️ 24/7 ZERO-DOWNTIME PROCESS SUPERVISOR
// Automatically spawns, monitors, and respawns index.js if it ever terminates.
// Guarantees 24/7 continuous operation with zero downtime.
// ══════════════════════════════════════════════════════════════════════════

const { spawn } = require('child_process');
const path = require('path');

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  🛡️ 24/7 ZERO-DOWNTIME PROCESS SUPERVISOR ACTIVE         ║');
console.log('║  Monitoring bot process for continuous 24/7 uptime       ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let restartCount = 0;
let lastRestart = 0;

function launchChild() {
  const now = Date.now();
  if (now - lastRestart < 10000) {
    restartCount++;
  } else {
    restartCount = 1;
  }
  lastRestart = now;

  console.log(`[SUPERVISOR] 🚀 Launching bot process (node index.js)...`);

  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });

  child.on('error', (err) => {
    console.error('[SUPERVISOR] ❌ Failed to spawn bot child process:', err?.message || err);
    console.log('[SUPERVISOR] ⏳ Respawning in 3 seconds...');
    setTimeout(launchChild, 3000);
  });

  child.on('exit', (code, signal) => {
    console.warn(`[SUPERVISOR] ⚠️ Bot process exited (code=${code}, signal=${signal}).`);
    const backoffMs = restartCount > 5 ? 5000 : 1500;
    console.log(`[SUPERVISOR] ⚡ Instantly respawning bot process in ${Math.round(backoffMs/1000)}s for ZERO DOWNTIME...`);
    setTimeout(launchChild, backoffMs);
  });
}

// Intercept termination signals to cleanly exit supervisor if intentional
process.on('SIGINT', () => {
  console.log('\n[SUPERVISOR] Received SIGINT (Ctrl+C). Shutting down supervisor gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SUPERVISOR] Received SIGTERM. Shutting down supervisor gracefully...');
  process.exit(0);
});

launchChild();
