import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './store.js';

export const DEFAULT_RADMIN_PORT = 4899;

export function findRadmin(env = process.env, exists = fs.existsSync) {
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles].filter(Boolean);
  return roots.map((root) => path.win32.join(root, 'Radmin Viewer 3', 'Radmin.exe')).find((file) => exists(file)) ?? null;
}

export function radminArgs(machine) {
  return [`/connect:${machine.host}:${machine.remote?.radminPort ?? DEFAULT_RADMIN_PORT}`];
}

export function openRadmin(machine) {
  if (!machine.host) throw new HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้ง IP');
  const viewer = findRadmin();
  if (!viewer) throw new HttpError(400, 'ไม่พบ Radmin Viewer 3 บนเครื่องนี้');
  const client = spawn(viewer, radminArgs(machine), { detached: true, stdio: 'ignore' });
  client.on('error', (err) => console.error(`radmin: ${err.message}`));
  client.unref();
}
