import crypto from 'node:crypto';
import net from 'node:net';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 1024 * 1024;
const CONNECT_TIMEOUT_MS = 8000;

export function acceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

export function encodeFrame(payload, opcode = 2) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

// Returns { opcode, payload, size } for one frame, null if more bytes are
// needed, or { error } when the client breaks the protocol.
export function decodeFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  if (!(buffer[1] & 0x80)) return { error: 'unmasked frame' };
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    const big = buffer.readBigUInt64BE(2);
    if (big > BigInt(MAX_FRAME)) return { error: 'frame too large' };
    length = Number(big);
    offset = 10;
  }
  if (length > MAX_FRAME) return { error: 'frame too large' };
  if (buffer.length < offset + 4 + length) return null;
  const mask = buffer.subarray(offset, offset + 4);
  const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
  for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  return { opcode, payload, size: offset + 4 + length };
}

// Bridges a browser WebSocket to the VNC port of one configured machine.
export function proxyVnc(req, socket, head, target, onEvent) {
  const tcp = net.connect({ host: target.host, port: target.port });
  tcp.setTimeout(CONNECT_TIMEOUT_MS);
  // Mouse and key events are tiny packets; batching them is felt as input lag.
  tcp.setNoDelay(true);
  socket.setNoDelay(true);
  let open = false;
  let pending = Buffer.alloc(0);

  const closeAll = () => {
    tcp.destroy();
    socket.destroy();
    if (open) {
      open = false;
      onEvent('close');
    }
  };

  const onClientData = (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const frame = decodeFrame(pending);
      if (!frame) return;
      if (frame.error) return closeAll();
      pending = pending.subarray(frame.size);
      if (frame.opcode <= 2) tcp.write(frame.payload);
      else if (frame.opcode === 8) return closeAll();
      else if (frame.opcode === 9) socket.write(encodeFrame(frame.payload, 10));
    }
  };

  tcp.once('connect', () => {
    tcp.setTimeout(0);
    const offered = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((p) => p.trim());
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey(req.headers['sec-websocket-key'])}`,
      ...(offered.includes('binary') ? ['Sec-WebSocket-Protocol: binary'] : []),
      '', '',
    ].join('\r\n'));
    open = true;
    onEvent('open');
    if (head.length) onClientData(head);
    socket.on('data', onClientData);
  });

  tcp.on('data', (data) => {
    if (!socket.write(encodeFrame(data))) {
      tcp.pause();
      socket.once('drain', () => tcp.resume());
    }
  });
  tcp.on('timeout', closeAll);
  tcp.on('error', closeAll);
  tcp.on('close', closeAll);
  socket.on('error', closeAll);
  socket.on('close', closeAll);
}
