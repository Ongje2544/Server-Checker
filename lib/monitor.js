import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { probe } from './probe.js';
import { capabilities, runPower } from './power.js';
import { canExec } from './console.js';
import { ACTIONS, HttpError } from './store.js';

const MAX_EVENTS = 200;
const MAX_HISTORY = 30;
const CONCURRENCY = 16;
const FAST_CHECK_MS = 3000;
const DEMO_TIMINGS = { start: [[6000, true]], stop: [[4000, false]], restart: [[3000, false], [12000, true]] };

const newRuntime = () => ({
  status: 'unknown', latencyMs: null, via: null, lastCheck: null, lastSeen: null,
  fails: 0, busy: null, transition: null, history: [],
});

export class Monitor extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.runtime = new Map();
    this.demoOn = new Map();
    this.auditFile = path.join(store.dir, 'audit.log');
    this.events = this.loadEvents();
  }

  loadEvents() {
    if (!fs.existsSync(this.auditFile)) return [];
    return fs.readFileSync(this.auditFile, 'utf8').trim().split('\n').slice(-MAX_EVENTS)
      .flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
  }

  rt(id) {
    if (!this.runtime.has(id)) this.runtime.set(id, newRuntime());
    return this.runtime.get(id);
  }

  log(entry) {
    const named = this.store.machines.find((m) => m.id === entry.machine);
    const item = {
      ts: new Date().toISOString(), ...entry,
      machineId: entry.machine, machine: named?.name ?? entry.machine,
    };
    this.events.push(item);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    fs.appendFile(this.auditFile, `${JSON.stringify(item)}\n`, () => {});
    this.emit('change');
  }

  start() {
    const loop = async () => {
      await this.checkAll();
      this.timer = setTimeout(loop, this.store.settings.intervalSec * 1000);
    };
    loop();
    this.fastTimer = setInterval(() => {
      for (const m of this.store.machines) {
        if (this.rt(m.id).transition) this.check(m);
      }
    }, FAST_CHECK_MS);
    this.scheduleTimer = setInterval(() => this.runSchedules(), 20000);
  }

  stop() {
    clearTimeout(this.timer);
    clearInterval(this.fastTimer);
    clearInterval(this.scheduleTimer);
  }

  async checkAll() {
    const queue = [...this.store.machines];
    const worker = async () => {
      while (queue.length) await this.check(queue.shift());
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  async measure(m) {
    if (m.demo) {
      if (!m.host) return null;
      if (!this.demoOn.has(m.id)) this.demoOn.set(m.id, !m.demoOff);
      return this.demoOn.get(m.id)
        ? { ok: true, latencyMs: 2 + Math.round(Math.random() * 18), via: 'จำลอง' }
        : { ok: false };
    }
    if (!m.host) return null;
    return probe(m, this.store.settings.pingTimeoutMs);
  }

  async check(m) {
    const rt = this.rt(m.id);
    if (rt.checking) return;
    rt.checking = true;
    try {
      const result = await this.measure(m);
      if (!this.store.machines.some((x) => x.id === m.id)) return;
      this.apply(m, rt, result);
    } finally {
      rt.checking = false;
    }
    this.emit('change');
  }

  apply(m, rt, result) {
    const previous = rt.status;
    rt.lastCheck = new Date().toISOString();
    if (!result) {
      rt.status = 'unknown';
      rt.latencyMs = null;
      return;
    }
    if (result.ok) {
      rt.fails = 0;
      rt.status = 'online';
      rt.latencyMs = result.latencyMs;
      rt.via = result.via;
      rt.lastSeen = rt.lastCheck;
    } else {
      rt.fails += 1;
      rt.latencyMs = null;
      // A power command makes loss expected, so don't wait out the full threshold.
      const threshold = rt.transition ? 2 : this.store.settings.failThreshold;
      if (previous === 'unknown' || rt.fails >= threshold) rt.status = 'offline';
    }
    rt.history.push(result.ok ? result.latencyMs : null);
    if (rt.history.length > MAX_HISTORY) rt.history.shift();

    if (rt.status !== previous && !(previous === 'unknown' && rt.status === 'online')) {
      this.log({
        type: 'status', machine: m.id, ok: rt.status === 'online',
        message: rt.status === 'online' ? 'กลับมาออนไลน์' : 'ออฟไลน์',
      });
    }
    this.settle(m, rt, result);
  }

  settle(m, rt, result) {
    const t = rt.transition;
    if (!t) return;
    if (!result.ok) t.sawDown = true;
    const reached = t.target === 'offline'
      ? rt.status === 'offline'
      : result.ok && (t.action === 'start' || t.sawDown);
    if (reached) {
      rt.transition = null;
      this.log({
        type: 'power', machine: m.id, action: t.action, ok: true, actor: t.actor,
        message: 'ยืนยันผลแล้ว: เครื่องอยู่ในสถานะที่สั่ง',
      });
    } else if (Date.now() > t.deadline) {
      rt.transition = null;
      this.log({
        type: 'power', machine: m.id, action: t.action, ok: false, actor: t.actor,
        message: 'หมดเวลารอ: เครื่องยังไม่อยู่ในสถานะที่สั่ง',
      });
    }
  }

  demoPower(m, action) {
    for (const [delay, on] of DEMO_TIMINGS[action]) {
      setTimeout(() => this.demoOn.set(m.id, on), delay).unref();
    }
    return 'จำลองการส่งคำสั่ง (ไม่มีเครื่องจริงถูกสั่ง)';
  }

  async power(id, action, actor = 'web') {
    const m = this.store.machine(id);
    if (!ACTIONS.includes(action)) throw new HttpError(400, 'คำสั่งไม่ถูกต้อง');
    if (!capabilities(m)[action]) throw new HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้งค่าวิธีสำหรับคำสั่งนี้');
    const rt = this.rt(id);
    if (rt.busy || rt.transition) throw new HttpError(409, 'เครื่องนี้กำลังทำคำสั่งก่อนหน้าอยู่');
    rt.busy = action;
    this.emit('change');
    try {
      const message = m.demo ? this.demoPower(m, action) : await runPower(m, action);
      rt.transition = {
        action, actor, sawDown: false,
        target: action === 'stop' ? 'offline' : 'online',
        deadline: Date.now() + this.store.settings.transitionTimeoutSec * 1000,
      };
      this.log({ type: 'power', machine: id, action, ok: true, actor, message });
      return { message };
    } catch (err) {
      this.log({ type: 'power', machine: id, action, ok: false, actor, message: err.message });
      throw err;
    } finally {
      rt.busy = null;
      this.emit('change');
    }
  }

  forget(id) {
    this.runtime.delete(id);
    this.demoOn.delete(id);
    this.emit('change');
  }

  async runSchedules(now = new Date()) {
    const time = now.toTimeString().slice(0, 5);
    const stamp = `${now.toDateString()} ${time}`;
    for (const s of this.store.schedules) {
      if (!s.enabled || s.time !== time || s.lastRun === stamp || !s.days.includes(now.getDay())) continue;
      s.lastRun = stamp;
      this.store.save();
      const { status } = this.rt(s.machineId);
      const alreadyThere = (s.action === 'start' && status === 'online')
        || (s.action !== 'start' && status === 'offline');
      if (alreadyThere) {
        this.log({
          type: 'power', machine: s.machineId, action: s.action, ok: true, actor: 'schedule',
          message: 'ข้าม: เครื่องอยู่ในสถานะนั้นแล้ว',
        });
        continue;
      }
      // power() already records the failure in the audit log.
      await this.power(s.machineId, s.action, 'schedule').catch(() => {});
    }
  }

  snapshot() {
    const machines = this.store.machines.map((m) => {
      const { checking, ...rt } = this.rt(m.id);
      return {
        ...m, ...rt, capabilities: capabilities(m),
        access: {
          exec: canExec(m),
          vnc: Boolean(m.host && m.remote?.vncPort && !m.demo),
          rdp: Boolean(m.host && m.remote?.rdpPort && !m.demo),
          radmin: Boolean(m.host && !m.demo),
        },
      };
    });
    return {
      serverTime: new Date().toISOString(),
      settings: this.store.settings,
      machines,
      schedules: this.store.schedules,
      events: this.events.slice(-60).reverse(),
    };
  }
}
