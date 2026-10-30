import { spawn } from 'node:child_process';
import { sshRemoteArgs } from './power.js';
import { HttpError } from './store.js';

export const MAX_COMMAND = 4000;
const TIMEOUT_MS = 120000;
const MAX_OUTPUT = 1024 * 1024;

export function canExec(machine) {
  return machine.demo || ['ssh', 'windows'].includes(machine.control?.type);
}

export function commandTarget(machine, command) {
  if (machine.control?.type === 'ssh') return ['ssh', sshRemoteArgs(machine, command)];
  if (machine.control?.type === 'windows') return ['winrs', [`-r:${machine.host}`, command]];
  throw new HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้งค่า SSH หรือ Windows สำหรับรันคำสั่ง');
}

export function validateCommand(command) {
  const text = String(command ?? '').trim();
  if (!text || text.length > MAX_COMMAND) throw new HttpError(400, `คำสั่งต้องยาว 1-${MAX_COMMAND} ตัวอักษร`);
  return text;
}

// Resolves with the exit code. It never rejects on a non-zero exit: that is
// the remote command's result, not a failure of the console.
export function streamProcess(file, args, { onData, signal, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let size = 0;
    let note = null;
    const stop = (reason) => {
      note ??= reason;
      child.kill();
    };
    const timer = setTimeout(() => stop(`หมดเวลา ${timeoutMs / 1000} วินาที`), timeoutMs);
    const onAbort = () => stop('ยกเลิกแล้ว');
    signal?.addEventListener('abort', onAbort, { once: true });
    const forward = (stream, kind) => {
      stream.setEncoding('utf8');
      stream.on('data', (text) => {
        size += text.length;
        if (size > MAX_OUTPUT) stop('ผลลัพธ์ยาวเกิน 1 MB');
        else onData(kind, text);
      });
    };
    forward(child.stdout, 'out');
    forward(child.stderr, 'err');
    const finish = (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, note });
    };
    child.on('error', (err) => {
      onData('err', `${err.message}\n`);
      finish(-1);
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}

function demoOutput(machine, command) {
  const first = command.split(/\s+/)[0];
  const known = {
    hostname: machine.name,
    whoami: 'demo',
    uptime: ' 15:08:26 up 12 days,  3:41,  1 user,  load average: 0.08, 0.12, 0.09',
    date: new Date().toString(),
    'df': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        80G   31G   46G  41% /',
    free: '               total        used        free\nMem:            8000        2710        5290',
  };
  return known[first] ?? `(จำลอง) ไม่ได้รันจริง: ${command}`;
}

export async function runCommand(machine, command, { onData, signal }) {
  if (machine.demo) {
    onData('out', `${demoOutput(machine, command)}\n`);
    return { code: 0, note: null };
  }
  const [file, args] = commandTarget(machine, command);
  return streamProcess(file, args, { onData, signal });
}
