export {};
'use strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = join(__dirname, '..', '..');
const assets = new Map<string, readonly [string, string]>([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['public/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/workspace.css', ['public/workspace.css', 'text/css; charset=utf-8']],
  ['/public/markdown-preview-pro.model.json', ['public/markdown-preview-pro.model.json', 'application/json; charset=utf-8']],
  ...['dom.js', 'app.js', 'parser.js', 'security.js', 'content.js', 'content-data.js', 'json.js', 'files.js',
    'workspace/model.js', 'workspace/db.js', 'workspace/migration.js', 'workspace/images.js', 'workspace/repository.js',
    'workspace/workspace-state.js', 'workspace/dialog.js', 'workspace/explorer.js', 'workspace/tabs.js',
    'workspace/actions.js', 'workspace/controller.js', 'workspace/start.js', 'workspace/title.js',
    'workspace/shortcuts.js', 'workspace/sync.js', 'workspace/backup.js', 'workspace/markdown-files.js',
    'workspace/markdown-import.js',
    'editor/render.js', 'editor/enhance.js', 'editor/commands.js', 'editor/layout.js', 'editor/bridge.js', 'editor/start.js', 'editor/palette.js', 'editor/image-insert.js'
  ].map((name): [string, readonly [string, string]] => ['/src/' + name, ['dist/src/' + name, 'text/javascript; charset=utf-8']]),
  ['/vendor/purify.min.js', ['vendor/purify.min.js', 'text/javascript; charset=utf-8']],
  ['/vendor/katex/katex.min.js', ['vendor/katex/katex.min.js', 'text/javascript; charset=utf-8']],
  ['/vendor/katex/katex.min.css', ['vendor/katex/katex.min.css', 'text/css; charset=utf-8']],
  ['/vendor/mermaid/mermaid.min.js', ['vendor/mermaid/mermaid.min.js', 'text/javascript; charset=utf-8']],
]);
// KaTeX font files are enumerated from the generated vendor folder so the allowlist stays exact.
try {
  for (const font of readdirSync(join(root, 'vendor/katex/fonts')).filter(name => name.endsWith('.woff2')))
    assets.set('/vendor/katex/fonts/' + font, ['vendor/katex/fonts/' + font, 'font/woff2']);
} catch { /* Fonts are optional until the first build creates them. */ }
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src https: http: data:; font-src 'self'; connect-src 'none'; object-src 'none'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none';";
function createAppServer() {
  return createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', csp);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host || '')) {
      response.writeHead(403).end('Forbidden host'); return;
    }
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.setHeader('Allow', 'GET, HEAD'); response.writeHead(405).end(); return;
    }
    let asset;
    try { asset = assets.get(new URL(request.url || '/', 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    if (!asset) { response.writeHead(404).end('Not found'); return; }
    try {
      const bytes = await readFile(join(root, asset[0]));
      response.setHeader('Content-Type', asset[1]);
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(500).end('Asset unavailable. Run npm run build.'); }
  });
}
module.exports = { createAppServer };
if (require.main === module) {
  const port = Number(process.env.PORT || 4175);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const server = createAppServer();
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on('error', (error:NodeJS.ErrnoException) => {
    process.stderr.write(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. An older copy of the server is probably still running: stop it (Ctrl+C in its terminal) and start again, or set PORT to another number.\n` : 'Cannot start the local server. Check PORT.\n');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`http://127.0.0.1:${port}\n`));
}
