import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import select
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from .console import can_exec, run_command, validate_command
from .monitor import Monitor
from .radmin import open_radmin
from .store import HttpError, Store
from .vnc import proxy_vnc

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent.parent))
PUBLIC = ROOT / 'public'
MAX_BODY = 256 * 1024
MAX_RUNNING_COMMANDS = 8
KEEPALIVE = 25
PUSH_DELAY = 0.3
LOCAL_HOST = re.compile(r'(127\.0\.0\.1|localhost|\[::1\])(:\d+)?')
MIME = {'.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'VPSMonitor'

    def log_message(self, *args):
        pass

    @property
    def app(self):
        return self.server.app

    def send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def password_ok(self):
        password = self.app.password
        if not password:
            return True
        scheme, _, value = self.headers.get('Authorization', '').partition(' ')
        if scheme != 'Basic':
            return False
        try:
            supplied = base64.b64decode(value).decode().partition(':')[2]
        except ValueError:
            return False
        return hmac.compare_digest(
            hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(password.encode()).digest(),
        )

    def host_allowed(self):
        return not self.app.loopback or bool(LOCAL_HOST.fullmatch(self.headers.get('Host', '')))

    def origin_matches(self, required):
        origin = self.headers.get('Origin')
        if not origin:
            return not required
        return urlparse(origin).netloc == self.headers.get('Host')

    def request_allowed(self):
        # Blocks DNS rebinding and other websites posting to this local server.
        if not self.host_allowed():
            return False
        if self.command == 'GET':
            return True
        return self.headers.get('X-VPS-Monitor') == '1' and self.origin_matches(False)

    def read_json(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            raise HttpError(413, 'ข้อมูลใหญ่เกินไป')
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except ValueError:
            raise HttpError(400, 'JSON ไม่ถูกต้อง') from None

    def serve_static(self, path):
        relative = 'index.html' if path == '/' else unquote(path).lstrip('/')
        file = (PUBLIC / relative).resolve()
        # The \\?\ prefix lets deep vendor files load from a long install path.
        target = Path(f'\\\\?\\{file}') if os.name == 'nt' else file
        if not file.is_relative_to(PUBLIC.resolve()) or not target.is_file():
            self.send_error(404)
            return
        data = target.read_bytes()
        kind = MIME.get(file.suffix) or mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        if kind.startswith('text/'):
            kind += '; charset=utf-8'
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        self.wfile.write(data)

    def stream_events(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True
        monitor = self.app.monitor
        seen = -1
        try:
            while True:
                with monitor.changed:
                    if monitor.version == seen:
                        monitor.changed.wait(KEEPALIVE)
                    fresh = monitor.version != seen
                if not fresh:
                    self.wfile.write(b': ping\n\n')
                    self.wfile.flush()
                    continue
                time.sleep(PUSH_DELAY)
                seen = monitor.version
                data = json.dumps(monitor.snapshot(), ensure_ascii=False)
                self.wfile.write(f'data: {data}\n\n'.encode())
                self.wfile.flush()
        except OSError:
            pass

    def watch_disconnect(self, cancel):
        def watch():
            try:
                while not cancel.is_set():
                    ready, _, _ = select.select([self.connection], [], [], 0.25)
                    if ready and not self.connection.recv(1, socket.MSG_PEEK):
                        cancel.set()
            except (OSError, ValueError):
                cancel.set()
        threading.Thread(target=watch, daemon=True).start()

    def handle_exec(self, machine_id):
        app = self.app
        machine = app.store.machine(machine_id)
        if not can_exec(machine):
            raise HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้งค่า SSH หรือ Windows สำหรับรันคำสั่ง')
        command = validate_command(self.read_json().get('command'))
        if not app.command_slots.acquire(blocking=False):
            raise HttpError(429, 'มีคำสั่งรันอยู่หลายรายการ ลองใหม่อีกครั้ง')
        cancel = threading.Event()
        try:
            app.monitor.log(machine_id, type='command', ok=True, actor='console', message=f'$ {command[:200]}')
            self.send_response(200)
            self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.close_connection = True
            lock = threading.Lock()

            def send(message):
                with lock:
                    self.wfile.write((json.dumps(message, ensure_ascii=False) + '\n').encode())
                    self.wfile.flush()

            def on_data(stream, data):
                try:
                    send({'stream': stream, 'data': data})
                except OSError:
                    cancel.set()

            self.watch_disconnect(cancel)
            code, note = run_command(machine, command, on_data, cancel)
            send({'exit': code, 'note': note})
        except OSError:
            pass
        finally:
            cancel.set()
            app.command_slots.release()

    def open_rdp(self, machine_id):
        m = self.app.store.machine(machine_id)
        if not self.app.loopback or sys.platform != 'win32':
            raise HttpError(400, 'เปิดโปรแกรมได้เฉพาะเมื่อรันบน Windows เครื่องนี้ ให้ดาวน์โหลดไฟล์ .rdp แทน')
        if not m.get('host') or not (m.get('remote') or {}).get('rdpPort'):
            raise HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้ง RDP port')
        subprocess.Popen(['mstsc', f"/v:{m['host']}:{m['remote']['rdpPort']}"])
        self.app.monitor.log(machine_id, type='remote', ok=True, actor='console', message='เปิด Remote Desktop')
        return {'ok': True}

    def open_radmin(self, machine_id):
        if not self.app.loopback or sys.platform != 'win32':
            raise HttpError(400, 'เปิด Radmin ได้เฉพาะเมื่อรันบน Windows เครื่องนี้')
        open_radmin(self.app.store.machine(machine_id))
        self.app.monitor.log(machine_id, type='remote', ok=True, actor='console', message='เปิด Radmin Viewer')
        return {'ok': True}

    def send_rdp_file(self, machine_id):
        m = self.app.store.machine(machine_id)
        if not m.get('host') or not (m.get('remote') or {}).get('rdpPort'):
            raise HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้ง RDP port')
        data = f"full address:s:{m['host']}:{m['remote']['rdpPort']}\r\nprompt for credentials:i:1\r\n".encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-rdp')
        self.send_header('Content-Disposition', 'attachment; filename="remote-desktop.rdp"')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_vnc(self, machine_id):
        # Browsers do not apply same-origin rules to WebSockets, so Origin is mandatory
        # here: without it any website could reach a machine's screen through this server.
        self.close_connection = True
        allowed = (
            self.password_ok() and self.host_allowed() and self.origin_matches(True)
            and self.headers.get('Sec-WebSocket-Key')
        )
        if not allowed:
            self.send_error(403)
            return
        m = next((x for x in self.app.store.machines if x['id'] == machine_id), None)
        if not m or m.get('demo') or not m.get('host') or not (m.get('remote') or {}).get('vncPort'):
            self.send_error(404)
            return

        def on_event(event):
            message = 'เริ่มคุมหน้าจอ VNC' if event == 'open' else 'จบการคุมหน้าจอ VNC'
            self.app.monitor.log(machine_id, type='remote', ok=True, actor='console', message=message)

        proxy_vnc(self.connection, self.headers, b'', m['host'], m['remote']['vncPort'], on_event)

    def routes(self):
        app = self.app
        store, monitor = app.store, app.monitor

        def add_machine(body):
            m = store.save_machine(body)
            threading.Thread(target=monitor.check, args=(m,), daemon=True).start()
            return m

        def edit_machine(machine_id, body):
            m = store.save_machine(body, machine_id)
            threading.Thread(target=monitor.check, args=(m,), daemon=True).start()
            return m

        def delete_machine(machine_id, _):
            store.delete_machine(machine_id)
            monitor.forget(machine_id)
            return {'ok': True}

        def clear_demo(_):
            ids = store.clear_demo_machines()
            for machine_id in ids:
                monitor.forget(machine_id)
            return {'removed': len(ids)}

        def check(machine_id, _):
            monitor.check(store.machine(machine_id))
            return {'ok': True}

        def settings(body):
            result = store.update_settings(body)
            monitor.notify()
            return result

        def add_schedule(body):
            result = store.add_schedule(body)
            monitor.notify()
            return result

        def toggle_schedule(schedule_id, body):
            result = store.set_schedule_enabled(schedule_id, body.get('enabled'))
            monitor.notify()
            return result

        def delete_schedule(schedule_id, _):
            store.delete_schedule(schedule_id)
            monitor.notify()
            return {'ok': True}

        def show_window(_):
            if app.on_show:
                app.on_show()
            return {'ok': True}

        return [
            ('GET', r'/api/state', lambda _: monitor.snapshot()),
            ('POST', r'/api/window/show', show_window),
            ('POST', r'/api/machines/clear-demo', clear_demo),
            ('POST', r'/api/machines', add_machine),
            ('POST', r'/api/machines/([^/]+)/rdp', lambda i, _: self.open_rdp(i)),
            ('POST', r'/api/machines/([^/]+)/radmin', lambda i, _: self.open_radmin(i)),
            ('POST', r'/api/machines/([^/]+)/check', check),
            ('POST', r'/api/machines/([^/]+)/power', lambda i, b: monitor.power(i, b.get('action'))),
            ('PUT', r'/api/machines/([^/]+)', edit_machine),
            ('DELETE', r'/api/machines/([^/]+)', delete_machine),
            ('PUT', r'/api/settings', settings),
            ('POST', r'/api/schedules', add_schedule),
            ('PATCH', r'/api/schedules/([^/]+)', toggle_schedule),
            ('DELETE', r'/api/schedules/([^/]+)', delete_schedule),
        ]

    def dispatch(self):
        try:
            path = urlparse(self.path).path
            vnc = re.fullmatch(r'/api/vnc/([^/]+)', path)
            if vnc and self.headers.get('Upgrade', '').lower() == 'websocket':
                self.handle_vnc(unquote(vnc.group(1)))
                return
            if not self.password_ok():
                self.send_response(401)
                self.send_header('WWW-Authenticate', 'Basic realm="VPS Monitor", charset="UTF-8"')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            if not self.request_allowed():
                self.send_json(403, {'error': 'ปฏิเสธคำขอ'})
                return
            if path == '/api/stream':
                self.stream_events()
                return
            exec_match = re.fullmatch(r'/api/machines/([^/]+)/exec', path)
            if exec_match and self.command == 'POST':
                self.handle_exec(unquote(exec_match.group(1)))
                return
            rdp_file = re.fullmatch(r'/api/machines/([^/]+)/rdp-file', path)
            if rdp_file and self.command == 'GET':
                self.send_rdp_file(unquote(rdp_file.group(1)))
                return
            if not path.startswith('/api/'):
                if self.command == 'GET':
                    self.serve_static(path)
                else:
                    self.send_json(405, {'error': 'Method not allowed'})
                return
            for method, pattern, handler in self.routes():
                match = re.fullmatch(pattern, path)
                if match and method == self.command:
                    body = {} if method == 'GET' else self.read_json()
                    params = [unquote(group) for group in match.groups()]
                    self.send_json(200, handler(*params, body))
                    return
            self.send_json(404, {'error': 'ไม่พบ API นี้'})
        except HttpError as err:
            self.send_json(err.status, {'error': err.message})
        except (BrokenPipeError, ConnectionError):
            self.close_connection = True

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = dispatch


class App:
    def __init__(self, data_dir, host='127.0.0.1', port=8787, password='', on_show=None):
        self.loopback = host in ('127.0.0.1', 'localhost', '::1')
        # This server can shut machines down, so it never listens beyond this
        # computer without a password.
        if not self.loopback and not password:
            raise SystemExit('HOST is not loopback: set ADMIN_PASSWORD before exposing this server.')
        self.password = password
        self.on_show = on_show
        self.store = Store(data_dir)
        self.monitor = Monitor(self.store)
        self.command_slots = threading.Semaphore(MAX_RUNNING_COMMANDS)
        self.server = ThreadingHTTPServer((host, port), Handler)
        self.server.daemon_threads = True
        self.server.app = self
        self.port = self.server.server_address[1]

    def start(self):
        self.monitor.start()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def stop(self):
        self.monitor.stop()
        self.server.shutdown()
        self.server.server_close()


def run():
    data = os.environ.get('DATA_DIR') or str(ROOT / 'data')
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', 8787))
    app = App(data, host, port, os.environ.get('ADMIN_PASSWORD', ''))
    app.monitor.start()
    print(f'VPS Monitor: http://{host}:{app.port}')
    app.server.serve_forever()


if __name__ == '__main__':
    run()
