import json
import os
import re
import threading
import uuid
from pathlib import Path

ZONES = ['LEFT A', 'LEFT B', 'RIGHT A', 'RIGHT B', 'END']
ACTIONS = ['start', 'stop', 'restart']
CONTROL_TYPES = ['none', 'ssh', 'windows', 'proxmox', 'http']
DEFAULT_SETTINGS = {
    'intervalSec': 15,
    'pingTimeoutMs': 2000,
    'failThreshold': 3,
    'transitionTimeoutSec': 180,
}
SETTING_RULES = {
    'intervalSec': (5, 3600),
    'pingTimeoutMs': (200, 10000),
    'failThreshold': (1, 20),
    'transitionTimeoutSec': (30, 1800),
}


class HttpError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def is_int(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def seed_machines():
    machines = []
    ip = 11

    def add(name, zone, floor, slot, **extra):
        nonlocal ip
        machines.append({
            'id': name, 'name': name, 'host': f'10.0.0.{ip}', 'tcpPort': None,
            'zone': zone, 'floor': floor, 'slot': slot, 'owner': 'ฝ่ายปฏิบัติการ',
            'demo': True, 'demoOff': False, 'control': {'type': 'none'}, 'wake': None,
            'remote': {}, **extra,
        })
        ip += 1

    for prefix, zone in (('LA', 'LEFT A'), ('LB', 'LEFT B'), ('RA', 'RIGHT A'), ('RB', 'RIGHT B')):
        number = 1
        for floor in (4, 3, 2, 1):
            for slot in (1, 2):
                name = f'{prefix}-{number:02d}'
                number += 1
                extra = {}
                if name in ('LA-07', 'RA-05'):
                    extra['demoOff'] = True
                if name == 'RB-07':
                    extra['host'] = ''
                add(name, zone, floor, slot, **extra)
    for slot in range(1, 5):
        add(f'END-0{slot}', 'END', 0, slot, **({'host': ''} if slot == 4 else {}))
    return machines


def validate_control(control):
    if not isinstance(control, dict) or control.get('type') not in CONTROL_TYPES:
        raise HttpError(400, 'วิธีควบคุมเครื่องไม่ถูกต้อง')
    kind = control['type']
    if kind == 'ssh':
        if not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_.-]{0,31}', str(control.get('user', ''))):
            raise HttpError(400, 'SSH user ไม่ถูกต้อง')
        if control.get('port') is not None and not is_int(control['port'], 1, 65535):
            raise HttpError(400, 'SSH port ไม่ถูกต้อง')
        key = control.get('keyPath')
        if key is not None and (not isinstance(key, str) or key.startswith('-')):
            raise HttpError(400, 'keyPath ไม่ถูกต้อง')
    if kind == 'proxmox':
        if not str(control.get('apiUrl', '')).startswith('https://'):
            raise HttpError(400, 'apiUrl ต้องขึ้นต้นด้วย https://')
        if not re.fullmatch(r'[\w.-]+', str(control.get('node', ''))):
            raise HttpError(400, 'node ไม่ถูกต้อง')
        if not is_int(control.get('vmid'), 100, 999999999):
            raise HttpError(400, 'vmid ไม่ถูกต้อง')
        if control.get('kind', 'qemu') not in ('qemu', 'lxc'):
            raise HttpError(400, 'kind ต้องเป็น qemu หรือ lxc')
        if not re.fullmatch(r'VPSMON_\w+', str(control.get('tokenEnv', ''))):
            raise HttpError(400, 'tokenEnv ต้องขึ้นต้นด้วย VPSMON_')
    if kind == 'http':
        actions = control.get('actions') or {}
        if not actions:
            raise HttpError(400, 'http ต้องกำหนด actions อย่างน้อย 1 รายการ')
        for name, action in actions.items():
            if name not in ACTIONS:
                raise HttpError(400, f'action ไม่รู้จัก: {name}')
            if not re.match(r'https?://', str((action or {}).get('url', ''))):
                raise HttpError(400, f'url ของ {name} ไม่ถูกต้อง')
    return control


def validate_machine(data, machine_id=None):
    m = data or {}
    name = str(m.get('name') or '').strip()
    if not name or len(name) > 32 or any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        raise HttpError(400, 'กรุณาตั้งชื่อเครื่อง ไม่เกิน 32 ตัวอักษร')
    host = str(m.get('host') or '').strip()
    if host and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.:-]{0,252}', host):
        raise HttpError(400, 'IP/Hostname ไม่ถูกต้อง')
    zone = m.get('zone')
    if zone not in ZONES:
        raise HttpError(400, 'โซนไม่ถูกต้อง')
    floor, slot = m.get('floor'), m.get('slot')
    # Must match the plan, otherwise a saved machine has no spot on the map.
    if zone == 'END':
        place_ok = floor == 0 and is_int(slot, 1, 4)
    else:
        place_ok = is_int(floor, 1, 4) and is_int(slot, 1, 2)
    if not place_ok:
        raise HttpError(400, 'ตำแหน่งไม่ถูกต้อง: ชั้น 1-4 ช่อง 1-2 หรือ END ชั้น 0 ช่อง 1-4')
    tcp_port = m.get('tcpPort')
    if tcp_port is not None and not is_int(tcp_port, 1, 65535):
        raise HttpError(400, 'TCP port ไม่ถูกต้อง')
    wake = None
    if (m.get('wake') or {}).get('mac'):
        mac = m['wake']['mac']
        if not re.fullmatch(r'([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}', mac):
            raise HttpError(400, 'MAC address ไม่ถูกต้อง')
        wake = {'mac': mac, 'broadcast': m['wake'].get('broadcast') or '255.255.255.255'}
    remote = {}
    for key in ('vncPort', 'rdpPort', 'radminPort'):
        port = (m.get('remote') or {}).get(key)
        if port is None:
            continue
        if not is_int(port, 1, 65535):
            raise HttpError(400, f'{key} ไม่ถูกต้อง')
        remote[key] = port
    return {
        'id': machine_id or str(uuid.uuid4()), 'name': name, 'host': host, 'tcpPort': tcp_port,
        'zone': zone, 'floor': floor, 'slot': slot, 'owner': str(m.get('owner') or '')[:80],
        'demo': bool(m.get('demo')), 'demoOff': bool(m.get('demoOff')),
        'control': validate_control(m.get('control') or {'type': 'none'}), 'wake': wake, 'remote': remote,
    }


class Store:
    def __init__(self, directory):
        self.dir = Path(directory)
        self.file = self.dir / 'config.json'
        self.lock = threading.RLock()
        self.dir.mkdir(parents=True, exist_ok=True)
        if self.file.exists():
            self.data = json.loads(self.file.read_text('utf-8'))
            self.data['settings'] = {**DEFAULT_SETTINGS, **self.data.get('settings', {})}
        else:
            self.data = {'settings': dict(DEFAULT_SETTINGS), 'machines': seed_machines(), 'schedules': []}
            self.save()

    @property
    def settings(self):
        return self.data['settings']

    @property
    def machines(self):
        return self.data['machines']

    @property
    def schedules(self):
        return self.data['schedules']

    def save(self):
        with self.lock:
            temp = self.file.with_suffix('.json.tmp')
            temp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), 'utf-8')
            os.replace(temp, self.file)

    def machine(self, machine_id):
        for m in self.machines:
            if m['id'] == machine_id:
                return m
        raise HttpError(404, 'ไม่พบเครื่องนี้')

    def assert_free(self, m, ignore_id):
        for other in self.machines:
            same_place = (other['zone'], other['floor'], other['slot']) == (m['zone'], m['floor'], m['slot'])
            if other['id'] != ignore_id and same_place:
                raise HttpError(409, f"ตำแหน่งนี้มี {other['name']} อยู่แล้ว")

    def save_machine(self, data, existing_id=None):
        with self.lock:
            # The id never changes, so renaming keeps schedules and history attached.
            m = validate_machine(data, existing_id)
            if any(x['id'] != m['id'] and x['name'] == m['name'] for x in self.machines):
                raise HttpError(409, 'ชื่อเครื่องนี้มีอยู่แล้ว')
            self.assert_free(m, existing_id)
            if existing_id:
                self.machine(existing_id)
                self.data['machines'] = [m if x['id'] == existing_id else x for x in self.machines]
            else:
                self.machines.append(m)
            self.save()
            return m

    def delete_machine(self, machine_id):
        with self.lock:
            self.machine(machine_id)
            self.data['machines'] = [x for x in self.machines if x['id'] != machine_id]
            self.data['schedules'] = [s for s in self.schedules if s['machineId'] != machine_id]
            self.save()

    def clear_demo_machines(self):
        with self.lock:
            ids = [m['id'] for m in self.machines if m.get('demo')]
            self.data['machines'] = [m for m in self.machines if not m.get('demo')]
            self.data['schedules'] = [s for s in self.schedules if s['machineId'] not in ids]
            self.save()
            return ids

    def update_settings(self, data):
        with self.lock:
            merged = dict(self.settings)
            for key, (low, high) in SETTING_RULES.items():
                if key not in data:
                    continue
                if not is_int(data[key], low, high):
                    raise HttpError(400, f'{key} ต้องอยู่ระหว่าง {low}-{high}')
                merged[key] = data[key]
            self.data['settings'] = merged
            self.save()
            return merged

    def add_schedule(self, data):
        with self.lock:
            s = data or {}
            self.machine(s.get('machineId'))
            if s.get('action') not in ACTIONS:
                raise HttpError(400, 'คำสั่งไม่ถูกต้อง')
            if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', str(s.get('time', ''))):
                raise HttpError(400, 'เวลาไม่ถูกต้อง')
            days = s.get('days') if isinstance(s.get('days'), list) else []
            days = sorted(set(days), key=str)
            if not days or not all(is_int(d, 0, 6) for d in days):
                raise HttpError(400, 'เลือกวันอย่างน้อย 1 วัน')
            item = {
                'id': str(uuid.uuid4()), 'machineId': s['machineId'], 'action': s['action'],
                'time': s['time'], 'days': days, 'enabled': True, 'lastRun': None,
            }
            self.schedules.append(item)
            self.save()
            return item

    def set_schedule_enabled(self, schedule_id, enabled):
        with self.lock:
            for s in self.schedules:
                if s['id'] == schedule_id:
                    s['enabled'] = bool(enabled)
                    self.save()
                    return s
            raise HttpError(404, 'ไม่พบตารางนี้')

    def delete_schedule(self, schedule_id):
        with self.lock:
            if not any(s['id'] == schedule_id for s in self.schedules):
                raise HttpError(404, 'ไม่พบตารางนี้')
            self.data['schedules'] = [s for s in self.schedules if s['id'] != schedule_id]
            self.save()
