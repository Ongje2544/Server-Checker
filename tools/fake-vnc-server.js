// Minimal RFB 3.8 server for trying the Remote page without a real VNC server.
// Usage: node tools/fake-vnc-server.js [port]. It paints a mark where you click
// and prints the mouse and keyboard events it receives.
import net from 'node:net';

const PORT = Number(process.argv[2] ?? 5999);
const W = 800;
const H = 500;

function pixelFormat() {
  const f = Buffer.alloc(16);
  f[0] = 32; f[1] = 24; f[3] = 1;
  f.writeUInt16BE(255, 4); f.writeUInt16BE(255, 6); f.writeUInt16BE(255, 8);
  f[10] = 0; f[11] = 8; f[12] = 16;
  return f;
}

net.createServer((socket) => {
  const screen = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      screen[i] = 15; screen[i + 1] = 40 + (y >> 3); screen[i + 2] = 70 + (x >> 3);
    }
  }
  const paint = (px, py) => {
    for (let y = Math.max(0, py - 6); y < Math.min(H, py + 6); y++) {
      for (let x = Math.max(0, px - 6); x < Math.min(W, px + 6); x++) {
        const i = (y * W + x) * 4;
        screen[i] = 34; screen[i + 1] = 197; screen[i + 2] = 94;
      }
    }
  };
  const sendFrame = () => {
    const header = Buffer.alloc(16);
    header.writeUInt16BE(1, 2);
    header.writeUInt16BE(W, 8);
    header.writeUInt16BE(H, 10);
    socket.write(Buffer.concat([header, screen]));
  };

  let stage = 'version';
  let buf = Buffer.alloc(0);
  let waiting = false;
  const take = (n) => {
    const out = buf.subarray(0, n);
    buf = buf.subarray(n);
    return out;
  };

  socket.write('RFB 003.008\n');
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (stage === 'version') {
        if (buf.length < 12) return;
        take(12);
        socket.write(Buffer.from([1, 1]));
        stage = 'security';
      } else if (stage === 'security') {
        if (buf.length < 1) return;
        take(1);
        socket.write(Buffer.alloc(4));
        stage = 'init';
      } else if (stage === 'init') {
        if (buf.length < 1) return;
        take(1);
        const size = Buffer.alloc(4);
        size.writeUInt16BE(W, 0);
        size.writeUInt16BE(H, 2);
        const name = Buffer.from('Fake VNC');
        const len = Buffer.alloc(4);
        len.writeUInt32BE(name.length);
        socket.write(Buffer.concat([size, pixelFormat(), len, name]));
        console.log('client connected');
        stage = 'run';
      } else {
        if (buf.length < 1) return;
        const type = buf[0];
        if (type === 0) {
          if (buf.length < 20) return;
          take(20);
        } else if (type === 2) {
          if (buf.length < 4) return;
          const count = buf.readUInt16BE(2);
          if (buf.length < 4 + count * 4) return;
          take(4 + count * 4);
        } else if (type === 3) {
          if (buf.length < 10) return;
          const incremental = take(10)[1];
          if (incremental) waiting = true;
          else sendFrame();
        } else if (type === 4) {
          if (buf.length < 8) return;
          const m = take(8);
          console.log(`key ${m[1] ? 'down' : 'up'} 0x${m.readUInt32BE(4).toString(16)}`);
        } else if (type === 5) {
          if (buf.length < 6) return;
          const m = take(6);
          if (m[1]) {
            const x = m.readUInt16BE(2);
            const y = m.readUInt16BE(4);
            console.log(`click ${x},${y}`);
            paint(x, y);
            if (waiting) {
              waiting = false;
              sendFrame();
            }
          }
        } else if (type === 6) {
          if (buf.length < 8) return;
          const n = buf.readUInt32BE(4);
          if (buf.length < 8 + n) return;
          take(8 + n);
        } else {
          console.log(`unknown message ${type}`);
          socket.destroy();
          return;
        }
      }
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`fake VNC on 127.0.0.1:${PORT}`));
