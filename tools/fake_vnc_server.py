"""Minimal RFB 3.8 server for trying the Remote page without a real VNC server.

Usage: python tools/fake_vnc_server.py [port]
It paints a mark where you click and prints the mouse and keyboard events it receives.
"""
import socket
import struct
import sys
import threading

WIDTH = 800
HEIGHT = 500


def read_exact(conn, size):
    data = b''
    while len(data) < size:
        chunk = conn.recv(size - len(data))
        if not chunk:
            raise ConnectionError
        data += chunk
    return data


def session(conn):
    screen = bytearray(WIDTH * HEIGHT * 4)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            i = (y * WIDTH + x) * 4
            screen[i:i + 3] = bytes((15, 40 + (y >> 3), 70 + (x >> 3)))

    def paint(px, py):
        for y in range(max(0, py - 6), min(HEIGHT, py + 6)):
            for x in range(max(0, px - 6), min(WIDTH, px + 6)):
                i = (y * WIDTH + x) * 4
                screen[i:i + 3] = bytes((34, 197, 94))

    def send_frame():
        conn.sendall(struct.pack('!BxHHHHHi', 0, 1, 0, 0, WIDTH, HEIGHT, 0) + bytes(screen))

    conn.sendall(b'RFB 003.008\n')
    read_exact(conn, 12)
    conn.sendall(bytes((1, 1)))
    read_exact(conn, 1)
    conn.sendall(bytes(4))
    read_exact(conn, 1)
    pixel_format = struct.pack('!BBBBHHHBBBxxx', 32, 24, 0, 1, 255, 255, 255, 0, 8, 16)
    name = b'Fake VNC'
    conn.sendall(struct.pack('!HH', WIDTH, HEIGHT) + pixel_format + struct.pack('!I', len(name)) + name)
    print('client connected', flush=True)

    waiting = False
    while True:
        kind = read_exact(conn, 1)[0]
        if kind == 0:
            read_exact(conn, 19)
        elif kind == 2:
            count = struct.unpack('!xH', read_exact(conn, 3))[0]
            read_exact(conn, count * 4)
        elif kind == 3:
            incremental = read_exact(conn, 9)[0]
            if incremental:
                waiting = True
            else:
                send_frame()
        elif kind == 4:
            down, key = struct.unpack('!B2xI', read_exact(conn, 7))
            print(f"key {'down' if down else 'up'} {key:#x}", flush=True)
        elif kind == 5:
            buttons, x, y = struct.unpack('!BHH', read_exact(conn, 5))
            if buttons:
                print(f'click {x},{y}', flush=True)
                paint(x, y)
                if waiting:
                    waiting = False
                    send_frame()
        elif kind == 6:
            length = struct.unpack('!3xI', read_exact(conn, 7))[0]
            read_exact(conn, length)
        else:
            print(f'unknown message {kind}', flush=True)
            return


def serve(conn):
    with conn:
        try:
            session(conn)
        except (ConnectionError, OSError):
            pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5999
    server = socket.create_server(('127.0.0.1', port))
    print(f'fake VNC on 127.0.0.1:{port}', flush=True)
    while True:
        conn, _ = server.accept()
        threading.Thread(target=serve, args=(conn,), daemon=True).start()


if __name__ == '__main__':
    main()
