import json
import os
import re
import socket
import subprocess
import urllib.error
import urllib.request

from .probe import NO_WINDOW
from .store import HttpError

COMMAND_TIMEOUT = 20


def capabilities(machine):
    # A machine that is off cannot answer SSH, so "start" always needs something
    # outside the guest: Wake-on-LAN, a hypervisor, or the provider's API.
    if machine.get('demo'):
        return {'start': True, 'stop': True, 'restart': True}
    control = machine.get('control') or {'type': 'none'}
    kind = control['type']
    if kind == 'proxmox':
        return {'start': True, 'stop': True, 'restart': True}
    caps = {'start': bool((machine.get('wake') or {}).get('mac')), 'stop': False, 'restart': False}
    if kind in ('ssh', 'windows'):
        caps['stop'] = caps['restart'] = True
    elif kind == 'http':
        for name in control.get('actions') or {}:
            caps[name] = True
    return caps


def run(file, args):
    try:
        done = subprocess.run(
            [file, *args], capture_output=True, text=True, errors='replace',
            timeout=COMMAND_TIMEOUT, creationflags=NO_WINDOW,
        )
    except subprocess.TimeoutExpired:
        raise HttpError(502, 'คำสั่งหมดเวลา') from None
    except OSError as err:
        raise HttpError(502, str(err)) from None
    if done.returncode != 0:
        lines = (done.stderr or done.stdout or '').strip().splitlines()
        raise HttpError(502, lines[-1] if lines else 'คำสั่งล้มเหลว')


def ssh_command(action):
    # Check sudo first, then detach so the reboot cannot kill the session and
    # make a successful command look like a failed one.
    power = 'systemctl poweroff' if action == 'stop' else 'systemctl reboot'
    return f"sudo -n true && (nohup sh -c 'sleep 1; sudo -n {power}' >/dev/null 2>&1 </dev/null &)"


def ssh_remote_args(machine, remote_command):
    c = machine['control']
    args = [
        '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
        '-o', 'StrictHostKeyChecking=accept-new', '-p', str(c.get('port') or 22),
    ]
    if c.get('keyPath'):
        args += ['-i', c['keyPath']]
    return [*args, f"{c['user']}@{machine['host']}", remote_command]


def ssh_args(machine, action):
    return ssh_remote_args(machine, ssh_command(action))


def windows_args(machine, action):
    return ['/s' if action == 'stop' else '/r', '/m', f"\\\\{machine['host']}", '/t', '10', '/c', 'VPS Monitor']


def magic_packet(mac):
    address = bytes.fromhex(re.sub('[:-]', '', mac))
    return b'\xff' * 6 + address * 16


def send_wake(wake):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.sendto(magic_packet(wake['mac']), (wake.get('broadcast') or '255.255.255.255', 9))
    except OSError as err:
        raise HttpError(502, str(err)) from None


def expand_env(text):
    # Secrets stay in the environment. Only VPSMON_* can be read, so a value typed
    # into the config cannot pull an unrelated variable out of the process.
    def replace(match):
        name = match.group(1)
        if name not in os.environ:
            raise HttpError(500, f'ไม่ได้ตั้งค่าตัวแปร {name}')
        return os.environ[name]
    return re.sub(r'\$\{(VPSMON_\w+)\}', replace, str(text))


def call_api(url, method, headers, body=None):
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=COMMAND_TIMEOUT):
            pass
    except urllib.error.HTTPError as err:
        raise HttpError(502, f'API ตอบ {err.code}') from None
    except (urllib.error.URLError, OSError) as err:
        raise HttpError(502, str(err)) from None


def proxmox(machine, action):
    c = machine['control']
    verb = {'start': 'start', 'stop': 'shutdown', 'restart': 'reboot'}[action]
    token = os.environ.get(c['tokenEnv'])
    if not token:
        raise HttpError(500, f"ไม่ได้ตั้งค่าตัวแปร {c['tokenEnv']}")
    base = c['apiUrl'].rstrip('/')
    url = f"{base}/api2/json/nodes/{c['node']}/{c.get('kind', 'qemu')}/{c['vmid']}/status/{verb}"
    call_api(url, 'POST', {'Authorization': f'PVEAPIToken={token}'})


def http_action(machine, action):
    a = machine['control']['actions'][action]
    headers = {key: expand_env(value) for key, value in (a.get('headers') or {}).items()}
    body = a.get('body')
    if body is not None:
        body = (body if isinstance(body, str) else json.dumps(body)).encode()
    call_api(expand_env(a['url']), a.get('method', 'POST'), headers, body)


def run_power(machine, action):
    control = machine.get('control') or {'type': 'none'}
    kind = control['type']
    wake = machine.get('wake') or {}
    has_api_start = kind == 'proxmox' or (kind == 'http' and (control.get('actions') or {}).get('start'))
    if action == 'start' and wake.get('mac') and not has_api_start:
        send_wake(wake)
        return 'ส่ง Wake-on-LAN แล้ว'
    if kind == 'ssh':
        run('ssh', ssh_args(machine, action))
        return 'ส่งคำสั่งผ่าน SSH แล้ว'
    if kind == 'windows':
        run('shutdown', windows_args(machine, action))
        return 'ส่งคำสั่ง Windows shutdown แล้ว'
    if kind == 'proxmox':
        proxmox(machine, action)
        return 'ส่งคำสั่งผ่าน Proxmox แล้ว'
    if kind == 'http':
        http_action(machine, action)
        return 'เรียก API แล้ว'
    raise HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้งค่าวิธีควบคุม')
