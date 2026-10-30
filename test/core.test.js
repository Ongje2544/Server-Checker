import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePing, ping, tcpConnect } from '../lib/probe.js';
import { capabilities, expandEnv, magicPacket, sshArgs, windowsArgs } from '../lib/power.js';
import { Monitor } from '../lib/monitor.js';
import { Store, validateMachine } from '../lib/store.js';

const base = { name: 'A-1', host: '10.0.0.1', zone: 'LEFT A', floor: 1, slot: 1 };
const tempStore = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'vpsmon-')));

test('parsePing treats gateway "unreachable" with exit 0 as down', () => {
  const out = 'Reply from 10.0.0.1: Destination host unreachable.';
  assert.equal(parsePing(out, true, '10.0.0.9').ok, false);
});

test('parsePing reads latency, including sub-millisecond replies', () => {
  assert.deepEqual(parsePing('Reply from 1.1.1.1: bytes=32 time=14ms TTL=57', true, '1.1.1.1'), { ok: true, latencyMs: 14 });
  assert.equal(parsePing('Reply: time<1ms TTL=128', true, '127.0.0.1').latencyMs, 1);
  assert.equal(parsePing('64 bytes: ttl=64 time=0.42 ms', true, '127.0.0.1').latencyMs, 0.42);
});

test('real ping reaches loopback', async () => {
  assert.equal((await ping('127.0.0.1', 1000)).ok, true);
});

test('tcpConnect reports a closed port as down', async () => {
  assert.equal((await tcpConnect('127.0.0.1', 1, 500)).ok, false);
});

test('magic packet is 6 x FF then the MAC 16 times', () => {
  const p = magicPacket('AA:BB:CC:DD:EE:FF');
  assert.equal(p.length, 102);
  assert.equal(p.subarray(0, 6).toString('hex'), 'ffffffffffff');
  assert.equal(p.subarray(96, 102).toString('hex'), 'aabbccddeeff');
});

test('capabilities: SSH cannot start a machine without Wake-on-LAN', () => {
  const ssh = { control: { type: 'ssh', user: 'root' } };
  assert.deepEqual(capabilities(ssh), { start: false, stop: true, restart: true });
  assert.equal(capabilities({ ...ssh, wake: { mac: 'AA:BB:CC:DD:EE:FF' } }).start, true);
});

test('ssh and windows argument building', () => {
  const m = { host: '10.0.0.5', control: { type: 'ssh', user: 'ops', port: 2222 } };
  const args = sshArgs(m, 'restart');
  assert.ok(args.includes('BatchMode=yes'));
  assert.ok(args.includes('ops@10.0.0.5'));
  assert.match(args.at(-1), /systemctl reboot/);
  assert.match(sshArgs(m, 'stop').at(-1), /systemctl poweroff/);
  assert.deepEqual(windowsArgs(m, 'stop').slice(0, 3), ['/s', '/m', '\\\\10.0.0.5']);
});

test('validateMachine rejects option injection in host and ssh user', () => {
  assert.throws(() => validateMachine({ ...base, host: '-oProxyCommand=calc' }));
  assert.throws(() => validateMachine({ ...base, control: { type: 'ssh', user: '-oProxyCommand=x' } }));
  assert.equal(validateMachine(base).name, 'A-1');
});

test('renaming to a Thai name keeps the id and its schedules', () => {
  const store = tempStore();
  const m = store.machines[0];
  store.addSchedule({ machineId: m.id, action: 'restart', time: '02:00', days: [1] });
  const saved = store.saveMachine({ ...m, name: 'เครื่องบัญชี 1' }, m.id);
  assert.equal(saved.id, m.id);
  assert.equal(store.schedules[0].machineId, m.id);
  assert.throws(() => store.saveMachine({ ...store.machines[1], name: 'เครื่องบัญชี 1' }, store.machines[1].id), { status: 409 });
});

test('validateMachine only accepts positions that exist on the plan', () => {
  assert.throws(() => validateMachine({ ...base, floor: 5 }));
  assert.throws(() => validateMachine({ ...base, slot: 3 }));
  assert.throws(() => validateMachine({ ...base, zone: 'END', floor: 1 }));
  assert.equal(validateMachine({ ...base, zone: 'END', floor: 0, slot: 4 }).slot, 4);
});

test('clearDemoMachines keeps real machines', () => {
  const store = tempStore();
  store.deleteMachine('LA-01');
  store.saveMachine({ ...base, name: 'REAL-1', floor: 4, slot: 1 });
  assert.equal(store.clearDemoMachines().length, 35);
  assert.deepEqual(store.machines.map((m) => m.name), ['REAL-1']);
});

test('expandEnv only reads VPSMON_ variables', () => {
  process.env.VPSMON_T = 'secret';
  assert.equal(expandEnv('Bearer ${VPSMON_T}'), 'Bearer secret');
  assert.equal(expandEnv('${PATH}'), '${PATH}');
});

test('offline needs consecutive failures, and one reply clears them', () => {
  const store = tempStore();
  store.updateSettings({ failThreshold: 3 });
  const monitor = new Monitor(store);
  const m = store.machines[0];
  const rt = monitor.rt(m.id);
  monitor.apply(m, rt, { ok: true, latencyMs: 5 });
  monitor.apply(m, rt, { ok: false });
  monitor.apply(m, rt, { ok: false });
  assert.equal(rt.status, 'online');
  monitor.apply(m, rt, { ok: true, latencyMs: 5 });
  monitor.apply(m, rt, { ok: false });
  monitor.apply(m, rt, { ok: false });
  assert.equal(rt.status, 'online');
  monitor.apply(m, rt, { ok: false });
  assert.equal(rt.status, 'offline');
});

test('restart is confirmed only after the machine went down and came back', async () => {
  const store = tempStore();
  const monitor = new Monitor(store);
  const m = store.machines[0];
  const rt = monitor.rt(m.id);
  monitor.apply(m, rt, { ok: true, latencyMs: 5 });
  await monitor.power(m.id, 'restart');
  monitor.apply(m, rt, { ok: true, latencyMs: 5 });
  assert.ok(rt.transition, 'still up: not confirmed yet');
  monitor.apply(m, rt, { ok: false });
  monitor.apply(m, rt, { ok: true, latencyMs: 5 });
  assert.equal(rt.transition, null);
  await assert.rejects(monitor.power('missing', 'stop'));
});

test('a second command is refused while one is in progress', async () => {
  const store = tempStore();
  const monitor = new Monitor(store);
  const id = store.machines[0].id;
  await monitor.power(id, 'stop');
  await assert.rejects(monitor.power(id, 'start'), { status: 409 });
});

test('schedule fires once per minute and skips machines already there', async () => {
  const store = tempStore();
  const monitor = new Monitor(store);
  const m = store.machines[0];
  const rt = monitor.rt(m.id);
  monitor.apply(m, rt, { ok: true, latencyMs: 5 });
  store.addSchedule({ machineId: m.id, action: 'start', time: '02:00', days: [1] });
  const monday2am = new Date(2026, 9, 26, 2, 0, 30);
  await monitor.runSchedules(monday2am);
  await monitor.runSchedules(monday2am);
  const logged = monitor.events.filter((e) => e.actor === 'schedule');
  assert.equal(logged.length, 1);
  assert.match(logged[0].message, /ข้าม/);
});
