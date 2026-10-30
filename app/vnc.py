import base64
import hashlib
import socket
import struct
import threading

WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
MAX_FRAME = 1024 * 1024
CONNECT_TIMEOUT = 8


def accept_key(key):
    return base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()


def encode_frame(payload, opcode=2):
    length = len(payload)
    first = 0x80 | opcode
    if length < 126:
        header = struct.pack('!BB', first, length)
    elif length < 65536:
        header = struct.pack('!BBH', first, 126, length)
    else:
        header = struct.pack('!BBQ', first, 127, length)
    return header + payload


def decode_frame(buffer):
    # Returns (opcode, payload, size), None if more bytes are needed, or the
    # string 'error' when the client breaks the protocol.
    if len(buffer) < 2:
        return None
    opcode = buffer[0] & 0x0f
    if not buffer[1] & 0x80:
        return 'error'
    length = buffer[1] & 0x7f
    offset = 2
    if length == 126:
        if len(buffer) < 4:
            return None
        length = struct.unpack_from('!H', buffer, 2)[0]
        offset = 4
    elif length == 127:
        if len(buffer) < 10:
            return None
        length = struct.unpack_from('!Q', buffer, 2)[0]
        offset = 10
    if length > MAX_FRAME:
        return 'error'
    if len(buffer) < offset + 4 + length:
        return None
    mask = buffer[offset:offset + 4]
    payload = bytes(b ^ mask[i % 4] for i, b in enumerate(buffer[offset + 4:offset + 4 + length]))
    return opcode, payload, offset + 4 + length


def proxy_vnc(client, headers, leftover, host, port, on_event):
    # Bridges a browser WebSocket to the VNC port of one configured machine.
    # Blocks until the session ends.
    try:
        tcp = socket.create_connection((host, port), CONNECT_TIMEOUT)
    except OSError:
        client.sendall(b'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
        return
    # Mouse and key events are tiny packets; batching them is felt as input lag.
    tcp.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

    offered = [p.strip() for p in headers.get('Sec-WebSocket-Protocol', '').split(',')]
    lines = [
        'HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
        f"Sec-WebSocket-Accept: {accept_key(headers['Sec-WebSocket-Key'])}",
    ]
    if 'binary' in offered:
        lines.append('Sec-WebSocket-Protocol: binary')
    client.sendall(('\r\n'.join(lines) + '\r\n\r\n').encode())
    on_event('open')

    closed = threading.Event()

    def close_all():
        closed.set()
        for sock in (tcp, client):
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    def from_vnc():
        try:
            while data := tcp.recv(65536):
                client.sendall(encode_frame(data))
        except OSError:
            pass
        close_all()

    threading.Thread(target=from_vnc, daemon=True).start()
    pending = bytearray(leftover)
    try:
        while not closed.is_set():
            while True:
                frame = decode_frame(pending)
                if frame is None:
                    break
                if frame == 'error':
                    return
                opcode, payload, size = frame
                del pending[:size]
                if opcode <= 2:
                    tcp.sendall(payload)
                elif opcode == 8:
                    return
                elif opcode == 9:
                    client.sendall(encode_frame(payload, 10))
            data = client.recv(65536)
            if not data:
                return
            pending += data
    except OSError:
        pass
    finally:
        close_all()
        tcp.close()
        on_event('close')
