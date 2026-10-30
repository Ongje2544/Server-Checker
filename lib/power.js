import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import { HttpError } from './store.js';

const COMMAND_TIMEOUT_MS = 20000;

// A machine that is off cannot answer SSH, so "start" always needs something
// outside the guest: Wake-on-LAN, a hypervisor, or the provider's API.
export function capabilities(machine) {
  if (machine.demo) return { start: true, stop: true, restart: true };
  const type = machine.control?.type ?? 'none';
  const caps = { start: Boolean(machine.wake?.mac), stop: false, restart: false };
  if (type === 'ssh' || type === 'windows') {
    caps.stop = true;
    caps.restart = true;
  } else if (type === 'proxmox') {
    return { start: true, stop: true, restart: true };
  } else if (type === 'http') {
    for (const key of Object.keys(machine.control.actions ?? {})) caps[key] = true;
  }
  return caps;
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: COMMAND_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || stdout || err.message).trim().split('\n').pop();
        reject(new HttpError(502, detail || 'คำสั่งล้มเหลว'));
      } else {
        resolve(String(stdout).trim());
      }
    });
  });
}

export function sshCommand(action) {
  // Check sudo first, then detach so the reboot cannot kill the session and
  // make a successful command look like a failed one.
  const power = action === 'stop' ? 'systemctl poweroff' : 'systemctl reboot';
  return `sudo -n true && (nohup sh -c 'sleep 1; sudo -n ${power}' >/dev/null 2>&1 </dev/null &)`;
}

export function sshArgs(machine, action) {
  return sshRemoteArgs(machine, sshCommand(action));
}

export function sshRemoteArgs(machine, remoteCommand) {
  const c = machine.control;
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-p', String(c.port ?? 22),
  ];
  if (c.keyPath) args.push('-i', c.keyPath);
  args.push(`${c.user}@${machine.host}`, remoteCommand);
  return args;
}

export function windowsArgs(machine, action) {
  return [action === 'stop' ? '/s' : '/r', '/m', `\\\\${machine.host}`, '/t', '10', '/c', 'VPS Monitor'];
}

export function magicPacket(mac) {
  const bytes = Buffer.from(mac.replace(/[:-]/g, ''), 'hex');
  const packet = Buffer.alloc(102, 0xff);
  for (let i = 0; i < 16; i++) bytes.copy(packet, 6 + i * 6);
  return packet;
}

function sendWake({ mac, broadcast }) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', (err) => {
      socket.close();
      reject(new HttpError(502, err.message));
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(magicPacket(mac), 9, broadcast || '255.255.255.255', (err) => {
        socket.close();
        if (err) reject(new HttpError(502, err.message));
        else resolve();
      });
    });
  });
}

// Secrets stay in the environment. Only VPSMON_* can be read, so a value typed
// into the config cannot pull an unrelated variable out of the process.
export function expandEnv(text) {
  return String(text).replace(/\$\{(VPSMON_\w+)\}/g, (_, name) => {
    if (process.env[name] === undefined) throw new HttpError(500, `ไม่ได้ตั้งค่าตัวแปร ${name}`);
    return process.env[name];
  });
}

async function callApi(url, options) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS) });
  } catch (err) {
    throw new HttpError(502, err.cause?.message ?? err.message);
  }
  if (!res.ok) throw new HttpError(502, `API ตอบ ${res.status}`);
}

function proxmox(machine, action) {
  const c = machine.control;
  const verb = { start: 'start', stop: 'shutdown', restart: 'reboot' }[action];
  const token = process.env[c.tokenEnv];
  if (!token) throw new HttpError(500, `ไม่ได้ตั้งค่าตัวแปร ${c.tokenEnv}`);
  const base = c.apiUrl.replace(/\/+$/, '');
  const url = `${base}/api2/json/nodes/${c.node}/${c.kind ?? 'qemu'}/${c.vmid}/status/${verb}`;
  return callApi(url, { method: 'POST', headers: { Authorization: `PVEAPIToken=${token}` } });
}

function httpAction(machine, action) {
  const a = machine.control.actions[action];
  const headers = Object.fromEntries(
    Object.entries(a.headers ?? {}).map(([k, v]) => [k, expandEnv(v)]),
  );
  const body = a.body === undefined ? undefined
    : typeof a.body === 'string' ? a.body : JSON.stringify(a.body);
  return callApi(expandEnv(a.url), { method: a.method ?? 'POST', headers, body });
}

export async function runPower(machine, action) {
  const c = machine.control ?? { type: 'none' };
  const hasApiStart = c.type === 'proxmox' || (c.type === 'http' && c.actions?.start);
  if (action === 'start' && machine.wake?.mac && !hasApiStart) {
    await sendWake(machine.wake);
    return 'ส่ง Wake-on-LAN แล้ว';
  }
  switch (c.type) {
    case 'ssh':
      await run('ssh', sshArgs(machine, action));
      return 'ส่งคำสั่งผ่าน SSH แล้ว';
    case 'windows':
      await run('shutdown', windowsArgs(machine, action));
      return 'ส่งคำสั่ง Windows shutdown แล้ว';
    case 'proxmox':
      await proxmox(machine, action);
      return 'ส่งคำสั่งผ่าน Proxmox แล้ว';
    case 'http':
      await httpAction(machine, action);
      return 'เรียก API แล้ว';
    default:
      throw new HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้งค่าวิธีควบคุม');
  }
}
