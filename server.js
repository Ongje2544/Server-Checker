import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store, HttpError } from './lib/store.js';
import { Monitor } from './lib/monitor.js';
import { canExec, runCommand, validateCommand } from './lib/console.js';
import { proxyVnc } from './lib/vnc.js';
import { openRadmin } from './lib/radmin.js';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8787);
const PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const MAX_BODY = 256 * 1024;
const MAX_RUNNING_COMMANDS = 8;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

// This server can shut machines down, so it never listens beyond this
// computer without a password.
if (!LOOPBACK && !PASSWORD) {
  console.error('HOST is not loopback: set ADMIN_PASSWORD before exposing this server.');
  process.exit(1);
}

const store = new Store(process.env.DATA_DIR ?? path.join(ROOT, 'data'));
const monitor = new Monitor(store);
const clients = new Set();
let runningCommands = 0;

let pushTimer = null;
monitor.on('change', () => {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const frame = `data: ${JSON.stringify(monitor.snapshot())}\n\n`;
    for (const res of clients) res.write(frame);
  }, 300);
});

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function passwordOk(req) {
  if (!PASSWORD) return true;
  const [scheme, value] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Basic' || !value) return false;
  const supplied = Buffer.from(value, 'base64').toString().split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(supplied).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// Blocks DNS rebinding and other websites posting to this local server.
function hostAllowed(req) {
  return !LOOPBACK || /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host ?? '');
}

function requestAllowed(req) {
  const hostHeader = req.headers.host ?? '';
  if (!hostAllowed(req)) return false;
  if (req.method === 'GET') return true;
  if (req.headers['x-vps-monitor'] !== '1') return false;
  const { origin } = req.headers;
  if (!origin) return true;
  try {
    return new URL(origin).host === hostHeader;
  } catch {
    return false;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'ข้อมูลใหญ่เกินไป'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new HttpError(400, 'JSON ไม่ถูกต้อง'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(pathname, res) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1);
  const file = path.resolve(PUBLIC, relative);
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  fs.createReadStream(file).pipe(res);
}

async function handleExec(id, req, res) {
  const machine = store.machine(id);
  if (!canExec(machine)) throw new HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้งค่า SSH หรือ Windows สำหรับรันคำสั่ง');
  const body = await readJson(req);
  const command = validateCommand(body.command);
  if (runningCommands >= MAX_RUNNING_COMMANDS) throw new HttpError(429, 'มีคำสั่งรันอยู่หลายรายการ ลองใหม่อีกครั้ง');
  monitor.log({ type: 'command', machine: id, ok: true, actor: 'console', message: `$ ${command.slice(0, 200)}` });

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const send = (message) => res.write(`${JSON.stringify(message)}\n`);
  runningCommands += 1;
  try {
    const { code, note } = await runCommand(machine, command, {
      signal: abort.signal,
      onData: (stream, data) => send({ stream, data }),
    });
    send({ exit: code, note });
  } finally {
    runningCommands -= 1;
    res.end();
  }
}

function openRdp(id) {
  const m = store.machine(id);
  if (!LOOPBACK || process.platform !== 'win32') {
    throw new HttpError(400, 'เปิดโปรแกรมได้เฉพาะเมื่อรันบน Windows เครื่องนี้ ให้ดาวน์โหลดไฟล์ .rdp แทน');
  }
  if (!m.host || !m.remote?.rdpPort) throw new HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้ง RDP port');
  const client = spawn('mstsc', [`/v:${m.host}:${m.remote.rdpPort}`], { detached: true, stdio: 'ignore' });
  client.on('error', (err) => console.error(`mstsc: ${err.message}`));
  client.unref();
  monitor.log({ type: 'remote', machine: id, ok: true, actor: 'console', message: 'เปิด Remote Desktop' });
  return { ok: true };
}

function sendRdpFile(id, res) {
  const m = store.machine(id);
  if (!m.host || !m.remote?.rdpPort) throw new HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้ง RDP port');
  res.writeHead(200, {
    'Content-Type': 'application/x-rdp',
    'Content-Disposition': 'attachment; filename="remote-desktop.rdp"',
  });
  res.end(`full address:s:${m.host}:${m.remote.rdpPort}\r\nprompt for credentials:i:1\r\n`);
}

const routes = [
  ['GET', /^\/api\/state$/, () => monitor.snapshot()],
  ['POST', /^\/api\/machines\/([^/]+)\/rdp$/, async ([id]) => openRdp(id)],
  ['POST', /^\/api\/machines\/([^/]+)\/radmin$/, async ([id]) => {
    if (!LOOPBACK || process.platform !== 'win32') {
      throw new HttpError(400, 'เปิด Radmin ได้เฉพาะเมื่อรันบน Windows เครื่องนี้');
    }
    const m = store.machine(id);
    openRadmin(m);
    monitor.log({ type: 'remote', machine: id, ok: true, actor: 'console', message: 'เปิด Radmin Viewer' });
    return { ok: true };
  }],
  ['POST', /^\/api\/machines$/, async (_, body) => {
    const m = store.saveMachine(body);
    monitor.check(m);
    return m;
  }],
  ['POST', /^\/api\/machines\/clear-demo$/, async () => {
    const ids = store.clearDemoMachines();
    ids.forEach((id) => monitor.forget(id));
    return { removed: ids.length };
  }],
  ['PUT', /^\/api\/machines\/([^/]+)$/, async ([id], body) => {
    const m = store.saveMachine(body, id);
    monitor.check(m);
    return m;
  }],
  ['DELETE', /^\/api\/machines\/([^/]+)$/, async ([id]) => {
    store.deleteMachine(id);
    monitor.forget(id);
    return { ok: true };
  }],
  ['POST', /^\/api\/machines\/([^/]+)\/check$/, async ([id]) => {
    await monitor.check(store.machine(id));
    return { ok: true };
  }],
  ['POST', /^\/api\/machines\/([^/]+)\/power$/, ([id], body) => monitor.power(id, body.action)],
  ['PUT', /^\/api\/settings$/, async (_, body) => {
    const s = store.updateSettings(body);
    monitor.emit('change');
    return s;
  }],
  ['POST', /^\/api\/schedules$/, async (_, body) => {
    const s = store.addSchedule(body);
    monitor.emit('change');
    return s;
  }],
  ['PATCH', /^\/api\/schedules\/([^/]+)$/, async ([id], body) => {
    const s = store.setScheduleEnabled(id, body.enabled);
    monitor.emit('change');
    return s;
  }],
  ['DELETE', /^\/api\/schedules\/([^/]+)$/, async ([id]) => {
    store.deleteSchedule(id);
    monitor.emit('change');
    return { ok: true };
  }],
];

const server = http.createServer(async (req, res) => {
  try {
    if (!passwordOk(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="VPS Monitor", charset="UTF-8"' }).end();
      return;
    }
    if (!requestAllowed(req)) return sendJson(res, 403, { error: 'ปฏิเสธคำขอ' });

    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(monitor.snapshot())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const execMatch = pathname.match(/^\/api\/machines\/([^/]+)\/exec$/);
    if (execMatch && req.method === 'POST') return await handleExec(decodeURIComponent(execMatch[1]), req, res);
    const rdpFile = pathname.match(/^\/api\/machines\/([^/]+)\/rdp-file$/);
    if (rdpFile && req.method === 'GET') return sendRdpFile(decodeURIComponent(rdpFile[1]), res);
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      return serveStatic(pathname, res);
    }
    for (const [method, pattern, handler] of routes) {
      const match = pathname.match(pattern);
      if (match && method === req.method) {
        const body = method === 'GET' ? {} : await readJson(req);
        const params = match.slice(1).map(decodeURIComponent);
        return sendJson(res, 200, await handler(params, body));
      }
    }
    sendJson(res, 404, { error: 'ไม่พบ API นี้' });
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    if (res.headersSent) return res.end();
    sendJson(res, err.status ?? 500, { error: err instanceof HttpError ? err.message : 'เกิดข้อผิดพลาดภายใน' });
  }
});

// Browsers do not apply same-origin rules to WebSockets, so Origin is mandatory
// here: without it any website could reach a machine's screen through this server.
function websocketAllowed(req) {
  if (!passwordOk(req) || !hostAllowed(req) || !req.headers['sec-websocket-key']) return false;
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}

server.on('upgrade', (req, socket, head) => {
  const refuse = (status) => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.on('error', () => socket.destroy());
  if (!websocketAllowed(req)) return refuse('403 Forbidden');
  const match = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/vnc\/([^/]+)$/);
  const m = match && store.machines.find((x) => x.id === decodeURIComponent(match[1]));
  if (!m || m.demo || !m.host || !m.remote?.vncPort) return refuse('404 Not Found');
  proxyVnc(req, socket, head, { host: m.host, port: m.remote.vncPort }, (event) => {
    monitor.log({
      type: 'remote', machine: m.id, ok: true, actor: 'console',
      message: event === 'open' ? 'เริ่มคุมหน้าจอ VNC' : 'จบการคุมหน้าจอ VNC',
    });
  });
});

// Keeps idle stream connections alive through proxies.
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000).unref();

// The desktop app waits on this before opening its window.
export const ready = new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, HOST, () => {
    console.log(`VPS Monitor: http://${HOST === '::1' ? '[::1]' : HOST}:${PORT}`);
    monitor.start();
    resolve();
  });
});
