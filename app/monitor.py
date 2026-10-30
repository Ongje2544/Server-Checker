import json
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from .console import can_exec
from .power import capabilities, run_power
from .probe import probe
from .store import ACTIONS, HttpError

MAX_EVENTS = 200
MAX_HISTORY = 30
CONCURRENCY = 16
FAST_CHECK = 3
SCHEDULE_TICK = 20
DEMO_TIMINGS = {'start': [(6, True)], 'stop': [(4, False)], 'restart': [(3, False), (12, True)]}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def new_runtime():
    return {
        'status': 'unknown', 'latencyMs': None, 'via': None, 'lastCheck': None, 'lastSeen': None,
        'fails': 0, 'busy': None, 'transition': None, 'history': [],
    }


class Monitor:
    def __init__(self, store):
        self.store = store
        self.lock = threading.RLock()
        self.runtime = {}
        self.demo_on = {}
        self.checking = set()
        self.audit_file = store.dir / 'audit.log'
        self.events = self.load_events()
        self.changed = threading.Condition()
        self.version = 0
        self.stopped = threading.Event()

    def load_events(self):
        if not self.audit_file.exists():
            return []
        events = []
        for line in self.audit_file.read_text('utf-8', errors='replace').splitlines()[-MAX_EVENTS:]:
            try:
                events.append(json.loads(line))
            except ValueError:
                pass
        return events

    def notify(self):
        with self.changed:
            self.version += 1
            self.changed.notify_all()

    def rt(self, machine_id):
        return self.runtime.setdefault(machine_id, new_runtime())

    def log(self, machine, **entry):
        named = next((m for m in self.store.machines if m['id'] == machine), None)
        item = {'ts': utc_now(), **entry, 'machineId': machine, 'machine': named['name'] if named else machine}
        with self.lock:
            self.events.append(item)
            del self.events[:-MAX_EVENTS]
        with self.audit_file.open('a', encoding='utf-8') as file:
            file.write(json.dumps(item, ensure_ascii=False) + '\n')
        self.notify()

    def start(self):
        for target in (self.main_loop, self.fast_loop, self.schedule_loop):
            threading.Thread(target=target, daemon=True).start()

    def stop(self):
        self.stopped.set()

    def main_loop(self):
        while not self.stopped.is_set():
            self.check_all()
            self.stopped.wait(self.store.settings['intervalSec'])

    def fast_loop(self):
        while not self.stopped.wait(FAST_CHECK):
            for m in list(self.store.machines):
                if self.rt(m['id'])['transition']:
                    self.check(m)

    def schedule_loop(self):
        while not self.stopped.wait(SCHEDULE_TICK):
            self.run_schedules()

    def check_all(self):
        with ThreadPoolExecutor(CONCURRENCY) as pool:
            list(pool.map(self.check, list(self.store.machines)))

    def measure(self, m):
        if not m.get('host'):
            return None
        if m.get('demo'):
            self.demo_on.setdefault(m['id'], not m.get('demoOff'))
            if self.demo_on[m['id']]:
                return {'ok': True, 'latencyMs': random.randint(2, 20), 'via': 'จำลอง'}
            return {'ok': False}
        return probe(m, self.store.settings['pingTimeoutMs'])

    def check(self, m):
        with self.lock:
            if m['id'] in self.checking:
                return
            self.checking.add(m['id'])
        try:
            result = self.measure(m)
            with self.lock:
                if any(x['id'] == m['id'] for x in self.store.machines):
                    self.apply(m, self.rt(m['id']), result)
        finally:
            with self.lock:
                self.checking.discard(m['id'])
        self.notify()

    def apply(self, m, rt, result):
        previous = rt['status']
        rt['lastCheck'] = utc_now()
        if result is None:
            rt['status'] = 'unknown'
            rt['latencyMs'] = None
            return
        if result['ok']:
            rt.update(fails=0, status='online', latencyMs=result['latencyMs'], via=result.get('via'), lastSeen=rt['lastCheck'])
        else:
            rt['fails'] += 1
            rt['latencyMs'] = None
            # A power command makes loss expected, so don't wait out the full threshold.
            threshold = 2 if rt['transition'] else self.store.settings['failThreshold']
            if previous == 'unknown' or rt['fails'] >= threshold:
                rt['status'] = 'offline'
        rt['history'].append(result['latencyMs'] if result['ok'] else None)
        del rt['history'][:-MAX_HISTORY]

        if rt['status'] != previous and not (previous == 'unknown' and rt['status'] == 'online'):
            online = rt['status'] == 'online'
            self.log(m['id'], type='status', ok=online, message='กลับมาออนไลน์' if online else 'ออฟไลน์')
        self.settle(m, rt, result)

    def settle(self, m, rt, result):
        t = rt['transition']
        if not t:
            return
        if not result['ok']:
            t['sawDown'] = True
        if t['target'] == 'offline':
            reached = rt['status'] == 'offline'
        else:
            reached = result['ok'] and (t['action'] == 'start' or t['sawDown'])
        if reached:
            rt['transition'] = None
            self.log(m['id'], type='power', action=t['action'], ok=True, actor=t['actor'],
                     message='ยืนยันผลแล้ว: เครื่องอยู่ในสถานะที่สั่ง')
        elif time.time() > t['deadline']:
            rt['transition'] = None
            self.log(m['id'], type='power', action=t['action'], ok=False, actor=t['actor'],
                     message='หมดเวลารอ: เครื่องยังไม่อยู่ในสถานะที่สั่ง')

    def demo_power(self, m, action):
        for delay, on in DEMO_TIMINGS[action]:
            timer = threading.Timer(delay, self.demo_on.__setitem__, (m['id'], on))
            timer.daemon = True
            timer.start()
        return 'จำลองการส่งคำสั่ง (ไม่มีเครื่องจริงถูกสั่ง)'

    def power(self, machine_id, action, actor='web'):
        m = self.store.machine(machine_id)
        if action not in ACTIONS:
            raise HttpError(400, 'คำสั่งไม่ถูกต้อง')
        if not capabilities(m)[action]:
            raise HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้งค่าวิธีสำหรับคำสั่งนี้')
        with self.lock:
            rt = self.rt(machine_id)
            if rt['busy'] or rt['transition']:
                raise HttpError(409, 'เครื่องนี้กำลังทำคำสั่งก่อนหน้าอยู่')
            rt['busy'] = action
        self.notify()
        try:
            message = self.demo_power(m, action) if m.get('demo') else run_power(m, action)
            with self.lock:
                rt['transition'] = {
                    'action': action, 'actor': actor, 'sawDown': False,
                    'target': 'offline' if action == 'stop' else 'online',
                    'deadline': time.time() + self.store.settings['transitionTimeoutSec'],
                }
            self.log(machine_id, type='power', action=action, ok=True, actor=actor, message=message)
            return {'message': message}
        except HttpError as err:
            self.log(machine_id, type='power', action=action, ok=False, actor=actor, message=err.message)
            raise
        finally:
            rt['busy'] = None
            self.notify()

    def forget(self, machine_id):
        self.runtime.pop(machine_id, None)
        self.demo_on.pop(machine_id, None)
        self.notify()

    def run_schedules(self, now=None):
        now = now or datetime.now()
        clock = now.strftime('%H:%M')
        stamp = now.strftime('%Y-%m-%d ') + clock
        weekday = (now.weekday() + 1) % 7
        for s in list(self.store.schedules):
            if not s['enabled'] or s['time'] != clock or s.get('lastRun') == stamp or weekday not in s['days']:
                continue
            s['lastRun'] = stamp
            self.store.save()
            status = self.rt(s['machineId'])['status']
            if (s['action'] == 'start' and status == 'online') or (s['action'] != 'start' and status == 'offline'):
                self.log(s['machineId'], type='power', action=s['action'], ok=True, actor='schedule',
                         message='ข้าม: เครื่องอยู่ในสถานะนั้นแล้ว')
                continue
            try:
                self.power(s['machineId'], s['action'], 'schedule')
            except HttpError:
                pass  # power() already recorded the failure.

    def snapshot(self):
        with self.lock:
            machines = []
            for m in self.store.machines:
                host = bool(m.get('host')) and not m.get('demo')
                remote = m.get('remote') or {}
                machines.append({
                    **m, **self.rt(m['id']), 'capabilities': capabilities(m),
                    'access': {
                        'exec': can_exec(m),
                        'vnc': host and bool(remote.get('vncPort')),
                        'rdp': host and bool(remote.get('rdpPort')),
                        'radmin': host,
                    },
                })
            return {
                'serverTime': utc_now(), 'settings': self.store.settings, 'machines': machines,
                'schedules': self.store.schedules, 'events': self.events[-60:][::-1],
            }
