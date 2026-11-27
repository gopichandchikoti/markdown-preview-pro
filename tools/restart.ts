export {};
'use strict';
/* Stops an older copy of this app's local server that is still holding the port, then starts a fresh one.
   Only a node process listening on the app's own port is stopped. */
const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');
const port = Number(process.env.PORT || 4175);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
const windows = process.platform === 'win32';

function listeningPids():string[] {
  if (windows) {
    const out = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).stdout || '';
    const pids = new Set<string>();
    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'TCP' && /LISTENING/i.test(parts[3] || '') && new RegExp(':' + port + '$').test(parts[1] || '')) pids.add(parts[4]);
    }
    return [...pids];
  }
  return (spawnSync('lsof', ['-ti', 'tcp:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout || '').split(/\s+/).filter(Boolean);
}
function isNode(pid:string):boolean {
  if (windows) return /node(\.exe)?/i.test(spawnSync('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout || '');
  return /node/i.test(spawnSync('ps', ['-p', pid, '-o', 'comm='], { encoding: 'utf8' }).stdout || '');
}
for (const pid of listeningPids()) {
  if (Number(pid) === process.pid) continue;
  if (!isNode(pid)) { process.stderr.write(`Port ${port} is used by another program (PID ${pid}), not a Node server. Stop it yourself or set PORT.\n`); process.exit(1); }
  if (windows) spawnSync('taskkill', ['/PID', pid, '/F']); else process.kill(Number(pid), 'SIGTERM');
  process.stdout.write(`Stopped the older server (PID ${pid}).\n`);
}
setTimeout(() => {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'inherit', env: process.env });
  child.on('exit', (code:number|null) => process.exit(code ?? 0));
}, 600);
