import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ZONES = ['LEFT A', 'LEFT B', 'RIGHT A', 'RIGHT B', 'END'];
export const ACTIONS = ['start', 'stop', 'restart'];
const CONTROL_TYPES = ['none', 'ssh', 'windows', 'proxmox', 'http'];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_SETTINGS = {
  intervalSec: 15,
  pingTimeoutMs: 2000,
  failThreshold: 3,
  transitionTimeoutSec: 180,
};

function seedMachines() {
  const machines = [];
  let ip = 11;
  const add = (name, zone, floor, slot, extra = {}) => {
    machines.push({
      id: name, name, host: `10.0.0.${ip++}`, tcpPort: null, zone, floor, slot,
      owner: 'ฝ่ายปฏิบัติการ', demo: true, control: { type: 'none' }, wake: null, ...extra,
    });
  };
  for (const [prefix, zone] of [['LA', 'LEFT A'], ['LB', 'LEFT B'], ['RA', 'RIGHT A'], ['RB', 'RIGHT B']]) {
    let n = 1;
    for (const floor of [4, 3, 2, 1]) {
      for (const slot of [1, 2]) {
        const name = `${prefix}-${String(n++).padStart(2, '0')}`;
        const extra = {};
        if (name === 'LA-07' || name === 'RA-05') extra.demoOff = true;
        if (name === 'RB-07') extra.host = '';
        add(name, zone, floor, slot, extra);
      }
    }
  }
  for (let slot = 1; slot <= 4; slot++) {
    add(`END-0${slot}`, 'END', 0, slot, slot === 4 ? { host: '' } : {});
  }
  return machines;
}

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function validateControl(c) {
  if (!c || typeof c !== 'object' || !CONTROL_TYPES.includes(c.type)) {
    throw new HttpError(400, 'วิธีควบคุมเครื่องไม่ถูกต้อง');
  }
  if (c.type === 'ssh') {
    if (!/^[a-z_][a-z0-9_.-]{0,31}$/i.test(c.user ?? '')) throw new HttpError(400, 'SSH user ไม่ถูกต้อง');
    if (c.port != null && !isInt(c.port, 1, 65535)) throw new HttpError(400, 'SSH port ไม่ถูกต้อง');
    if (c.keyPath != null && (typeof c.keyPath !== 'string' || c.keyPath.startsWith('-'))) {
      throw new HttpError(400, 'keyPath ไม่ถูกต้อง');
    }
  }
  if (c.type === 'proxmox') {
    if (!/^https:\/\//.test(c.apiUrl ?? '')) throw new HttpError(400, 'apiUrl ต้องขึ้นต้นด้วย https://');
    if (!/^[\w.-]+$/.test(c.node ?? '')) throw new HttpError(400, 'node ไม่ถูกต้อง');
    if (!isInt(c.vmid, 100, 999999999)) throw new HttpError(400, 'vmid ไม่ถูกต้อง');
    if (!['qemu', 'lxc'].includes(c.kind ?? 'qemu')) throw new HttpError(400, 'kind ต้องเป็น qemu หรือ lxc');
    if (!/^VPSMON_\w+$/.test(c.tokenEnv ?? '')) throw new HttpError(400, 'tokenEnv ต้องขึ้นต้นด้วย VPSMON_');
  }
  if (c.type === 'http') {
    const entries = Object.entries(c.actions ?? {});
    if (!entries.length) throw new HttpError(400, 'http ต้องกำหนด actions อย่างน้อย 1 รายการ');
    for (const [name, a] of entries) {
      if (!ACTIONS.includes(name)) throw new HttpError(400, `action ไม่รู้จัก: ${name}`);
      if (!/^https?:\/\//.test(a?.url ?? '')) throw new HttpError(400, `url ของ ${name} ไม่ถูกต้อง`);
    }
  }
  return c;
}

export function validateMachine(input, id = crypto.randomUUID()) {
  const m = input ?? {};
  const name = String(m.name ?? '').trim();
  if (!name || name.length > 32 || /\p{Cc}/u.test(name)) throw new HttpError(400, 'กรุณาตั้งชื่อเครื่อง ไม่เกิน 32 ตัวอักษร');
  const host = String(m.host ?? '').trim();
  if (host && !/^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$/.test(host)) throw new HttpError(400, 'IP/Hostname ไม่ถูกต้อง');
  if (!ZONES.includes(m.zone)) throw new HttpError(400, 'โซนไม่ถูกต้อง');
  // Must match the plan, otherwise a saved machine has no spot on the map.
  const placeOk = m.zone === 'END'
    ? m.floor === 0 && isInt(m.slot, 1, 4)
    : isInt(m.floor, 1, 4) && isInt(m.slot, 1, 2);
  if (!placeOk) throw new HttpError(400, 'ตำแหน่งไม่ถูกต้อง: ชั้น 1-4 ช่อง 1-2 หรือ END ชั้น 0 ช่อง 1-4');
  if (m.tcpPort != null && !isInt(m.tcpPort, 1, 65535)) throw new HttpError(400, 'TCP port ไม่ถูกต้อง');
  let wake = null;
  if (m.wake?.mac) {
    if (!/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(m.wake.mac)) throw new HttpError(400, 'MAC address ไม่ถูกต้อง');
    wake = { mac: m.wake.mac, broadcast: m.wake.broadcast || '255.255.255.255' };
  }
  const remote = {};
  for (const key of ['vncPort', 'rdpPort', 'radminPort']) {
    const port = m.remote?.[key];
    if (port == null) continue;
    if (!isInt(port, 1, 65535)) throw new HttpError(400, `${key} ไม่ถูกต้อง`);
    remote[key] = port;
  }
  return {
    remote, id, name, host, tcpPort: m.tcpPort ?? null, zone: m.zone, floor: m.floor, slot: m.slot,
    owner: String(m.owner ?? '').slice(0, 80), demo: Boolean(m.demo), demoOff: Boolean(m.demoOff),
    control: validateControl(m.control ?? { type: 'none' }), wake,
  };
}

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'config.json');
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data.settings = { ...DEFAULT_SETTINGS, ...this.data.settings };
    } else {
      this.data = { settings: { ...DEFAULT_SETTINGS }, machines: seedMachines(), schedules: [] };
      this.save();
    }
  }

  get settings() { return this.data.settings; }
  get machines() { return this.data.machines; }
  get schedules() { return this.data.schedules; }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  machine(id) {
    const m = this.machines.find((x) => x.id === id);
    if (!m) throw new HttpError(404, 'ไม่พบเครื่องนี้');
    return m;
  }

  assertFree(m, ignoreId) {
    const taken = this.machines.find((x) => x.id !== ignoreId
      && x.zone === m.zone && x.floor === m.floor && x.slot === m.slot);
    if (taken) throw new HttpError(409, `ตำแหน่งนี้มี ${taken.name} อยู่แล้ว`);
  }

  saveMachine(input, existingId = null) {
    // The id never changes, so renaming keeps schedules and history attached.
    const m = existingId ? validateMachine(input, existingId) : validateMachine(input);
    if (this.machines.some((x) => x.id !== m.id && x.name === m.name)) {
      throw new HttpError(409, 'ชื่อเครื่องนี้มีอยู่แล้ว');
    }
    this.assertFree(m, existingId);
    if (existingId) {
      const i = this.machines.findIndex((x) => x.id === existingId);
      if (i < 0) throw new HttpError(404, 'ไม่พบเครื่องนี้');
      this.machines[i] = m;
    } else {
      this.machines.push(m);
    }
    this.save();
    return m;
  }

  deleteMachine(id) {
    this.machine(id);
    this.data.machines = this.machines.filter((x) => x.id !== id);
    this.data.schedules = this.schedules.filter((s) => s.machineId !== id);
    this.save();
  }

  clearDemoMachines() {
    const ids = this.machines.filter((m) => m.demo).map((m) => m.id);
    this.data.machines = this.machines.filter((m) => !m.demo);
    this.data.schedules = this.schedules.filter((s) => !ids.includes(s.machineId));
    this.save();
    return ids;
  }

  updateSettings(input) {
    const s = { ...this.settings };
    const rules = {
      intervalSec: [5, 3600], pingTimeoutMs: [200, 10000],
      failThreshold: [1, 20], transitionTimeoutSec: [30, 1800],
    };
    for (const [key, [min, max]] of Object.entries(rules)) {
      if (input[key] === undefined) continue;
      if (!isInt(input[key], min, max)) throw new HttpError(400, `${key} ต้องอยู่ระหว่าง ${min}-${max}`);
      s[key] = input[key];
    }
    this.data.settings = s;
    this.save();
    return s;
  }

  addSchedule(input) {
    const s = input ?? {};
    this.machine(s.machineId);
    if (!ACTIONS.includes(s.action)) throw new HttpError(400, 'คำสั่งไม่ถูกต้อง');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time ?? '')) throw new HttpError(400, 'เวลาไม่ถูกต้อง');
    const days = Array.isArray(s.days) ? [...new Set(s.days)] : [];
    if (!days.length || !days.every((d) => isInt(d, 0, 6))) throw new HttpError(400, 'เลือกวันอย่างน้อย 1 วัน');
    const item = {
      id: crypto.randomUUID(), machineId: s.machineId, action: s.action,
      time: s.time, days: days.sort(), enabled: true, lastRun: null,
    };
    this.schedules.push(item);
    this.save();
    return item;
  }

  setScheduleEnabled(id, enabled) {
    const s = this.schedules.find((x) => x.id === id);
    if (!s) throw new HttpError(404, 'ไม่พบตารางนี้');
    s.enabled = Boolean(enabled);
    this.save();
    return s;
  }

  deleteSchedule(id) {
    if (!this.schedules.some((x) => x.id === id)) throw new HttpError(404, 'ไม่พบตารางนี้');
    this.data.schedules = this.schedules.filter((x) => x.id !== id);
    this.save();
  }
}
