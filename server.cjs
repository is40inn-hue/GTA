#!/usr/bin/env node
'use strict';

// Local RC4.9 launcher. No packages, installs, uploads or public listener.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.data': 'application/octet-stream',
  '.bin': 'application/octet-stream'
};

function locateFile(root, rawUrl) {
  const question = rawUrl.indexOf('?');
  const rawPath = question === -1 ? rawUrl : rawUrl.slice(0, question);
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch (_) { return { status: 400 }; }
  if (!decoded.startsWith('/') || /[\\\0:]/.test(decoded)) return { status: 400 };
  const parts = decoded.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..' || part.startsWith('.'))) return { status: 403 };
  const inside = file => { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
  let file = path.join(root, ...parts);
  try {
    file = fs.realpathSync(file);
    if (!inside(file)) return { status: 403 };
    let stat = fs.statSync(file);
    if (stat.isDirectory()) {
      if (!decoded.endsWith('/')) {
        const query = question === -1 ? '' : rawUrl.slice(question);
        return { status: 308, location: '/' + parts.map(encodeURIComponent).join('/') + '/' + query };
      }
      file = fs.realpathSync(path.join(file, 'index.html'));
      if (!inside(file)) return { status: 403 };
      stat = fs.statSync(file);
    }
    if (!stat.isFile()) return { status: 404 };
    return { status: 200, file, size: stat.size, type: TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' };
  } catch (_) { return { status: 404 }; }
}

function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return false;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function openBrowser(url) {
  let command, args;
  if (process.platform === 'win32') {
    command = process.env.ComSpec || 'cmd.exe'; args = ['/d', '/c', 'start', '', url];
  } else if (process.platform === 'darwin') { command = 'open'; args = [url]; }
  else { command = 'xdg-open'; args = [url]; }
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => console.log('Браузер не открылся автоматически. Скопируй адрес выше в Chrome, Safari или Firefox.'));
  child.on('exit', code => { if (code) console.log('Скопируй адрес выше в браузер. Окно запуска оставь открытым.'); });
  child.unref();
}

function selectRoot(baseDirectory) {
  for (const directory of [baseDirectory, path.join(baseDirectory, 'dist')]) {
    try {
      const root = fs.realpathSync(directory);
      if (fs.statSync(path.join(root, 'index.html')).isFile()) return root;
    } catch (_) { /* Try the older package layout. */ }
  }
  throw new Error('Не найден index.html. Распакуй весь ZIP в обычную папку и запусти START из неё.');
}

function main() {
  let root;
  try {
    root = selectRoot(__dirname);
    const required = ['app.js', 'exam-engine.js', 'native-vc/index.html', 'native-vc/runtime/index.wasm'];
    const missing = required.filter(file => {
      try { const info = fs.statSync(path.join(root, file)); return !info.isFile() || !info.size; }
      catch (_) { return true; }
    });
    if (missing.length) throw new Error('Архив распакован не полностью. Не найдены: ' + missing.join(', ') + '. Распакуй весь ZIP заново.');
  } catch (error) {
    console.error('\nНе удалось запустить ЕГЭ по GTA.\n' + error.message);
    process.exitCode = 1; return;
  }
  const server = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const port = server.address().port;
    if (req.headers.host !== '127.0.0.1:' + port && req.headers.host !== 'localhost:' + port) { res.writeHead(403); res.end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const result = locateFile(root, req.url || '/');
    if (result.status !== 200) {
      res.writeHead(result.status, result.location ? { Location: result.location } : { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : 'RC4: ' + result.status); return;
    }
    const range = parseRange(req.headers.range, result.size);
    if (range === false) { res.writeHead(416, { 'Content-Range': 'bytes */' + result.size }); res.end(); return; }
    const headers = { 'Content-Type': result.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'Content-Length': range ? range.end - range.start + 1 : result.size };
    if (range) headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + result.size;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(result.file, range || undefined);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
  let fallback = false;
  server.on('error', error => {
    if (!fallback && error.code === 'EADDRINUSE') { fallback = true; server.listen(0, '127.0.0.1'); return; }
    console.error('Не удалось открыть локальный порт: ' + error.message + '\nЗакрой лишние окна запуска и повтори. Адрес будет показан только после успешного старта.'); process.exitCode = 1;
  });
  server.on('listening', () => {
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    console.log('\nЕГЭ по GTA · RC4.9 запущен на этом компьютере.\n\n' + url + '\n\nОставь это окно открытым. Если браузер не открылся сам — скопируй адрес выше.\nДля остановки нажми Ctrl+C.\n');
    openBrowser(url);
  });
  process.on('SIGINT', () => server.close(() => process.exit(0)));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  server.listen(4173, '127.0.0.1');
}

module.exports = { locateFile, parseRange, TYPES, selectRoot };
if (require.main === module) main();
