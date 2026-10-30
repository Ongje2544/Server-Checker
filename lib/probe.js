import { execFile } from 'node:child_process';
import net from 'node:net';

const isWindows = process.platform === 'win32';

// TTL is the reliable marker: Windows ping exits 0 on "Destination host
// unreachable", and the word stays in English on localized Windows.
export function parsePing(stdout, exitOk, host) {
  if (!exitOk) return { ok: false };
  const ipv6 = host.includes(':');
  if (!ipv6 && !/ttl=/i.test(stdout)) return { ok: false };
  const match = stdout.match(/time[=<]\s*([\d.]+)/i);
  return { ok: true, latencyMs: match ? Number(match[1]) : null };
}

export function ping(host, timeoutMs) {
  const args = isWindows
    ? ['-n', '1', '-w', String(timeoutMs), host]
    : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];
  const started = performance.now();
  return new Promise((resolve) => {
    execFile('ping', args, { timeout: timeoutMs + 2000, windowsHide: true }, (err, stdout) => {
      const result = parsePing(stdout ?? '', !err, host);
      if (result.ok && result.latencyMs == null) {
        result.latencyMs = Math.round(performance.now() - started);
      }
      resolve(result);
    });
  });
}

export function tcpConnect(host, port, timeoutMs) {
  const started = performance.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok ? { ok: true, latencyMs: Math.round(performance.now() - started) } : { ok: false });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// Many VPS providers drop ICMP, so a configured TCP port counts as a second opinion.
export async function probe(machine, timeoutMs) {
  const viaPing = await ping(machine.host, timeoutMs);
  if (viaPing.ok) return { ...viaPing, via: 'ping' };
  if (machine.tcpPort) {
    const viaTcp = await tcpConnect(machine.host, machine.tcpPort, timeoutMs);
    if (viaTcp.ok) return { ...viaTcp, via: `tcp:${machine.tcpPort}` };
  }
  return { ok: false };
}
