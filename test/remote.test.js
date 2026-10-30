import test from 'node:test';
import assert from 'node:assert/strict';
import { canExec, commandTarget, runCommand, streamProcess, validateCommand } from '../lib/console.js';
import { acceptKey, decodeFrame, encodeFrame } from '../lib/vnc.js';
import { findRadmin, radminArgs } from '../lib/radmin.js';

const node = process.execPath;

test('streamProcess streams stdout and stderr and returns the exit code', async () => {
  const seen = [];
  const script = "console.log('ออก'); console.error('พลาด'); process.exit(3)";
  const { code } = await streamProcess(node, ['-e', script], { onData: (kind, text) => seen.push([kind, text]) });
  assert.equal(code, 3);
  assert.deepEqual(seen.sort(), [['err', 'พลาด\n'], ['out', 'ออก\n']]);
});

test('streamProcess stops on abort and on timeout', async () => {
  const hang = ['-e', 'setTimeout(() => {}, 60000)'];
  const abort = new AbortController();
  const running = streamProcess(node, hang, { onData() {}, signal: abort.signal });
  abort.abort();
  assert.equal((await running).note, 'ยกเลิกแล้ว');
  const timed = await streamProcess(node, hang, { onData() {}, timeoutMs: 100 });
  assert.match(timed.note, /หมดเวลา/);
});

test('a missing client program is reported instead of crashing', async () => {
  const seen = [];
  const { code } = await streamProcess('no-such-program-x', [], { onData: (_, t) => seen.push(t) });
  assert.equal(code, -1);
  assert.equal(seen.length, 1);
});

test('demo machines never spawn a process', async () => {
  let out = '';
  await runCommand({ demo: true, name: 'D' }, 'rm -rf /', { onData: (_, t) => { out += t; } });
  assert.match(out, /ไม่ได้รันจริง/);
});

test('command targets and validation', () => {
  const ssh = { host: 'h', control: { type: 'ssh', user: 'u' } };
  const [file, args] = commandTarget(ssh, 'uptime');
  assert.equal(file, 'ssh');
  assert.equal(args.at(-1), 'uptime');
  assert.equal(commandTarget({ host: 'h', control: { type: 'windows' } }, 'dir')[0], 'winrs');
  assert.throws(() => commandTarget({ control: { type: 'proxmox' } }, 'x'));
  assert.equal(canExec({ control: { type: 'none' } }), false);
  assert.throws(() => validateCommand('   '));
  assert.throws(() => validateCommand('x'.repeat(4001)));
});

test('radmin connects to the default or the saved port', () => {
  assert.deepEqual(radminArgs({ host: '192.0.2.10', remote: {} }), ['/connect:192.0.2.10:4899']);
  assert.deepEqual(radminArgs({ host: 'pc', remote: { radminPort: 5000 } }), ['/connect:pc:5000']);
});

test('findRadmin prefers the 32-bit folder and reports a missing viewer', () => {
  const env = { 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF' };
  assert.equal(findRadmin(env, () => true), 'C:\\PF86\\Radmin Viewer 3\\Radmin.exe');
  assert.equal(findRadmin(env, () => false), null);
});

test('WebSocket accept key matches the RFC 6455 example', () => {
  assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

function masked(payload, opcode = 2) {
  const plain = encodeFrame(payload, opcode);
  const offset = plain.length - payload.length;
  const mask = Buffer.from([1, 2, 3, 4]);
  const body = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
  const head = Buffer.from(plain.subarray(0, offset));
  head[1] |= 0x80;
  return Buffer.concat([head, mask, body]);
}

test('decodeFrame handles short, medium and split frames', () => {
  for (const size of [5, 300, 70000]) {
    const payload = Buffer.alloc(size, 7);
    const frame = decodeFrame(masked(payload));
    assert.equal(frame.payload.length, size);
    assert.equal(frame.payload[0], 7);
  }
  const whole = masked(Buffer.from('abc'));
  assert.equal(decodeFrame(whole.subarray(0, 4)), null);
});

test('decodeFrame rejects unmasked and oversized frames', () => {
  assert.ok(decodeFrame(encodeFrame(Buffer.from('x'))).error);
  const huge = Buffer.alloc(14);
  huge[1] = 0x80 | 127;
  huge.writeBigUInt64BE(BigInt(2 ** 40), 2);
  assert.ok(decodeFrame(huge).error);
});
