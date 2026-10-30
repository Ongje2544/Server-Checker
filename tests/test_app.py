import base64
import json
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from app import console, power, probe, radmin, vnc
from app.monitor import Monitor
from app.server import App
from app.store import HttpError, Store, validate_machine

BASE = {'name': 'A-1', 'host': '10.0.0.1', 'zone': 'LEFT A', 'floor': 1, 'slot': 1}


def temp_store():
    return Store(tempfile.mkdtemp(prefix='vpsmon-'))


class ProbeTests(unittest.TestCase):
    def test_gateway_unreachable_with_exit_0_is_down(self):
        self.assertFalse(probe.parse_ping('Reply from 10.0.0.1: Destination host unreachable.', True, '10.0.0.9')['ok'])

    def test_latency_parsing(self):
        self.assertEqual(probe.parse_ping('bytes=32 time=14ms TTL=57', True, '1.1.1.1')['latencyMs'], 14)
        self.assertEqual(probe.parse_ping('Reply: time<1ms TTL=128', True, '127.0.0.1')['latencyMs'], 1)

    def test_real_ping_reaches_loopback(self):
        self.assertTrue(probe.ping('127.0.0.1', 1000)['ok'])

    def test_closed_port_is_down(self):
        self.assertFalse(probe.tcp_connect('127.0.0.1', 1, 300)['ok'])


class PowerTests(unittest.TestCase):
    def test_magic_packet(self):
        packet = power.magic_packet('AA:BB:CC:DD:EE:FF')
        self.assertEqual(len(packet), 102)
        self.assertEqual(packet[:6], b'\xff' * 6)
        self.assertEqual(packet[-6:].hex(), 'aabbccddeeff')

    def test_ssh_cannot_start_without_wake_on_lan(self):
        ssh = {'control': {'type': 'ssh', 'user': 'root'}}
        self.assertEqual(power.capabilities(ssh), {'start': False, 'stop': True, 'restart': True})
        self.assertTrue(power.capabilities({**ssh, 'wake': {'mac': 'AA:BB:CC:DD:EE:FF'}})['start'])

    def test_arguments(self):
        m = {'host': '10.0.0.5', 'control': {'type': 'ssh', 'user': 'ops', 'port': 2222}}
        args = power.ssh_args(m, 'restart')
        self.assertIn('BatchMode=yes', args)
        self.assertIn('ops@10.0.0.5', args)
        self.assertIn('systemctl reboot', args[-1])
        self.assertIn('systemctl poweroff', power.ssh_args(m, 'stop')[-1])
        self.assertEqual(power.windows_args(m, 'stop')[:3], ['/s', '/m', '\\\\10.0.0.5'])

    def test_expand_env_reads_only_vpsmon_names(self):
        import os
        os.environ['VPSMON_T'] = 'secret'
        self.assertEqual(power.expand_env('Bearer ${VPSMON_T}'), 'Bearer secret')
        self.assertEqual(power.expand_env('${PATH}'), '${PATH}')


class StoreTests(unittest.TestCase):
    def test_rejects_option_injection(self):
        with self.assertRaises(HttpError):
            validate_machine({**BASE, 'host': '-oProxyCommand=calc'})
        with self.assertRaises(HttpError):
            validate_machine({**BASE, 'control': {'type': 'ssh', 'user': '-oProxyCommand=x'}})

    def test_positions_must_exist_on_plan(self):
        for bad in ({'floor': 5}, {'slot': 3}, {'zone': 'END', 'floor': 1}):
            with self.assertRaises(HttpError):
                validate_machine({**BASE, **bad})
        self.assertEqual(validate_machine({**BASE, 'zone': 'END', 'floor': 0, 'slot': 4})['slot'], 4)

    def test_rename_keeps_id_and_schedules(self):
        store = temp_store()
        m = store.machines[0]
        store.add_schedule({'machineId': m['id'], 'action': 'restart', 'time': '02:00', 'days': [1]})
        saved = store.save_machine({**m, 'name': 'เครื่องบัญชี 1'}, m['id'])
        self.assertEqual(saved['id'], m['id'])
        self.assertEqual(store.schedules[0]['machineId'], m['id'])
        other = store.machines[1]
        with self.assertRaises(HttpError):
            store.save_machine({**other, 'name': 'เครื่องบัญชี 1'}, other['id'])

    def test_clear_demo_keeps_real_machines(self):
        store = temp_store()
        store.delete_machine('LA-01')
        store.save_machine({**BASE, 'name': 'REAL-1', 'floor': 4})
        self.assertEqual(len(store.clear_demo_machines()), 35)
        self.assertEqual([m['name'] for m in store.machines], ['REAL-1'])


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.store = temp_store()
        self.monitor = Monitor(self.store)
        self.m = self.store.machines[0]
        self.rt = self.monitor.rt(self.m['id'])

    def up(self):
        self.monitor.apply(self.m, self.rt, {'ok': True, 'latencyMs': 5})

    def down(self):
        self.monitor.apply(self.m, self.rt, {'ok': False})

    def test_offline_needs_consecutive_failures(self):
        self.up()
        self.down()
        self.down()
        self.assertEqual(self.rt['status'], 'online')
        self.up()
        self.down()
        self.down()
        self.assertEqual(self.rt['status'], 'online')
        self.down()
        self.assertEqual(self.rt['status'], 'offline')

    def test_restart_confirmed_only_after_down_and_back(self):
        self.up()
        self.monitor.power(self.m['id'], 'restart')
        self.up()
        self.assertIsNotNone(self.rt['transition'])
        self.down()
        self.up()
        self.assertIsNone(self.rt['transition'])

    def test_second_command_refused(self):
        self.monitor.power(self.m['id'], 'stop')
        with self.assertRaises(HttpError) as caught:
            self.monitor.power(self.m['id'], 'start')
        self.assertEqual(caught.exception.status, 409)

    def test_schedule_fires_once_and_skips(self):
        self.up()
        self.store.add_schedule({'machineId': self.m['id'], 'action': 'start', 'time': '02:00', 'days': [1]})
        monday = datetime(2026, 10, 26, 2, 0, 30)
        self.monitor.run_schedules(monday)
        self.monitor.run_schedules(monday)
        logged = [e for e in self.monitor.events if e.get('actor') == 'schedule']
        self.assertEqual(len(logged), 1)
        self.assertIn('ข้าม', logged[0]['message'])


class ConsoleTests(unittest.TestCase):
    def test_streams_and_returns_exit_code(self):
        import sys
        seen = []
        script = "import sys; print('ok'); print('bad', file=sys.stderr); sys.exit(3)"
        code, _ = console.stream_process([sys.executable, '-c', script], lambda k, t: seen.append(k))
        self.assertEqual(code, 3)
        self.assertEqual(sorted(seen), ['err', 'out'])

    def test_cancel_and_timeout(self):
        import sys
        hang = [sys.executable, '-c', 'import time; time.sleep(60)']
        cancel = threading.Event()
        cancel.set()
        self.assertEqual(console.stream_process(hang, lambda *_: None, cancel)[1], 'ยกเลิกแล้ว')
        self.assertIn('หมดเวลา', console.stream_process(hang, lambda *_: None, timeout=0.2)[1])

    def test_missing_program_is_reported(self):
        seen = []
        code, _ = console.stream_process(['no-such-program-x'], lambda k, t: seen.append(t))
        self.assertEqual(code, -1)
        self.assertEqual(len(seen), 1)

    def test_demo_never_runs_anything(self):
        out = []
        console.run_command({'demo': True, 'name': 'D'}, 'rm -rf /', lambda k, t: out.append(t))
        self.assertIn('ไม่ได้รันจริง', out[0])

    def test_targets_and_validation(self):
        self.assertEqual(console.command_target({'host': 'h', 'control': {'type': 'ssh', 'user': 'u'}}, 'up')[-1], 'up')
        self.assertEqual(console.command_target({'host': 'h', 'control': {'type': 'windows'}}, 'dir')[0], 'winrs')
        with self.assertRaises(HttpError):
            console.command_target({'control': {'type': 'proxmox'}}, 'x')
        with self.assertRaises(HttpError):
            console.validate_command('x' * 4001)


class RadminTests(unittest.TestCase):
    def test_port(self):
        self.assertEqual(radmin.radmin_args({'host': '192.0.2.10', 'remote': {}}), ['/connect:192.0.2.10:4899'])
        self.assertEqual(radmin.radmin_args({'host': 'pc', 'remote': {'radminPort': 5000}}), ['/connect:pc:5000'])

    def test_find(self):
        env = {'ProgramFiles(x86)': 'C:\\PF86', 'ProgramFiles': 'C:\\PF'}
        self.assertEqual(radmin.find_radmin(env, lambda _: True), 'C:\\PF86\\Radmin Viewer 3\\Radmin.exe')
        self.assertIsNone(radmin.find_radmin(env, lambda _: False))


def masked(payload, opcode=2):
    plain = vnc.encode_frame(payload, opcode)
    offset = len(plain) - len(payload)
    mask = bytes([1, 2, 3, 4])
    head = bytearray(plain[:offset])
    head[1] |= 0x80
    return bytes(head) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


class FrameTests(unittest.TestCase):
    def test_accept_key_matches_rfc(self):
        self.assertEqual(vnc.accept_key('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=')

    def test_sizes_and_split_frames(self):
        for size in (5, 300, 70000):
            self.assertEqual(len(vnc.decode_frame(masked(bytes([7]) * size))[1]), size)
        self.assertIsNone(vnc.decode_frame(masked(b'abc')[:4]))

    def test_rejects_unmasked_and_oversized(self):
        self.assertEqual(vnc.decode_frame(vnc.encode_frame(b'x')), 'error')
        huge = bytearray(14)
        huge[1] = 0x80 | 127
        huge[2:10] = (2 ** 40).to_bytes(8, 'big')
        self.assertEqual(vnc.decode_frame(bytes(huge)), 'error')


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.echo = socket.create_server(('127.0.0.1', 0))
        cls.echo_port = cls.echo.getsockname()[1]

        def echo():
            while True:
                try:
                    conn, _ = cls.echo.accept()
                except OSError:
                    return
                with conn:
                    while data := conn.recv(4096):
                        conn.sendall(data)
        threading.Thread(target=echo, daemon=True).start()

        cls.dir = tempfile.mkdtemp(prefix='vpsmon-')
        cls.app = App(cls.dir, port=0)
        cls.app.store.delete_machine('END-04')
        cls.app.store.save_machine({**BASE, 'name': 'R', 'host': '127.0.0.1', 'zone': 'END', 'floor': 0, 'slot': 4, 'remote': {'vncPort': cls.echo_port}})
        cls.machine = next(m for m in cls.app.store.machines if m['name'] == 'R')
        cls.app.store.data['machines'] = [m for m in cls.app.store.machines if m['id'] in (cls.machine['id'], 'LA-01')]
        cls.app.start()
        cls.url = f'http://127.0.0.1:{cls.app.port}'

    @classmethod
    def tearDownClass(cls):
        cls.app.stop()
        cls.echo.close()

    def call(self, path, method='GET', body=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.url + path, data=data, method=method, headers={
            'Content-Type': 'application/json', 'X-VPS-Monitor': '1', **(headers or {}),
        })
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as err:
            return err.code, err.read()

    def test_state_and_static(self):
        status, body = self.call('/api/state')
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(body)['machines']), 2)
        self.assertEqual(self.call('/')[0], 200)
        self.assertEqual(self.call('/vendor/novnc/core/rfb.js')[0], 200)
        self.assertEqual(self.call('/..%2f..%2fmain.py')[0], 404)

    def test_write_guards(self):
        path = '/api/machines/LA-01/power'
        request = urllib.request.Request(self.url + path, data=b'{"action":"stop"}', method='POST')
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=5)
        self.assertEqual(caught.exception.code, 403)
        self.assertEqual(self.call(path, 'POST', {'action': 'stop'}, {'Origin': 'http://evil.example'})[0], 403)
        self.assertEqual(self.call('/api/state', headers={'Host': 'evil.example'})[0], 403)

    def test_exec_streams_ndjson(self):
        status, body = self.call('/api/machines/LA-01/exec', 'POST', {'command': 'uptime'})
        lines = [json.loads(line) for line in body.decode().splitlines()]
        self.assertEqual(status, 200)
        self.assertEqual(lines[0]['stream'], 'out')
        self.assertEqual(lines[-1]['exit'], 0)

    def upgrade(self, origin):
        sock = socket.create_connection(('127.0.0.1', self.app.port), 5)
        extra = f'Origin: {origin}\r\n' if origin else ''
        sock.sendall((
            f"GET /api/vnc/{self.machine['id']} HTTP/1.1\r\nHost: 127.0.0.1:{self.app.port}\r\n"
            'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n'
            f'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: binary\r\n{extra}\r\n'
        ).encode())
        return sock

    def test_websocket_requires_same_origin(self):
        for origin in ('http://evil.example', None):
            with self.upgrade(origin) as sock:
                self.assertIn(b'403', sock.recv(64))

    def test_websocket_proxies_both_ways(self):
        with self.upgrade(f'http://127.0.0.1:{self.app.port}') as sock:
            head = sock.recv(1024)
            self.assertIn(b'101', head)
            self.assertIn(b's3pPLMBiTxaQ9kYGzzhZRbK+xOo=', head)
            sock.sendall(masked(b'hello'))
            self.assertEqual(sock.recv(64), vnc.encode_frame(b'hello'))

    def test_password_required_when_set(self):
        app = App(tempfile.mkdtemp(prefix='vpsmon-'), port=0, password='pw')
        app.start()
        try:
            url = f'http://127.0.0.1:{app.port}/api/state'
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(url, timeout=5)
            self.assertEqual(caught.exception.code, 401)
            token = base64.b64encode(b'admin:pw').decode()
            request = urllib.request.Request(url, headers={'Authorization': f'Basic {token}'})
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertEqual(response.status, 200)
        finally:
            app.stop()

    def test_refuses_public_bind_without_password(self):
        with self.assertRaises(SystemExit):
            App(tempfile.mkdtemp(prefix='vpsmon-'), host='0.0.0.0', port=0)


if __name__ == '__main__':
    unittest.main()
