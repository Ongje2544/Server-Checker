import subprocess
import threading
from datetime import datetime

from .power import ssh_remote_args
from .probe import NO_WINDOW
from .store import HttpError

MAX_COMMAND = 4000
TIMEOUT = 120
MAX_OUTPUT = 1024 * 1024


def can_exec(machine):
    return bool(machine.get('demo')) or (machine.get('control') or {}).get('type') in ('ssh', 'windows')


def command_target(machine, command):
    kind = (machine.get('control') or {}).get('type')
    if kind == 'ssh':
        return ['ssh', *ssh_remote_args(machine, command)]
    if kind == 'windows':
        return ['winrs', f"-r:{machine['host']}", command]
    raise HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้งค่า SSH หรือ Windows สำหรับรันคำสั่ง')


def validate_command(command):
    text = str(command or '').strip()
    if not text or len(text) > MAX_COMMAND:
        raise HttpError(400, f'คำสั่งต้องยาว 1-{MAX_COMMAND} ตัวอักษร')
    return text


def stream_process(args, on_data, cancel=None, timeout=TIMEOUT):
    # Returns the exit code and a note. A non-zero exit is the remote command's
    # result, not a failure of the console.
    try:
        child = subprocess.Popen(
            args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding='utf-8', errors='replace', bufsize=1, creationflags=NO_WINDOW,
        )
    except OSError as err:
        on_data('err', f'{err}\n')
        return -1, None

    state = {'note': None, 'size': 0}
    lock = threading.Lock()

    def stop(reason):
        with lock:
            state['note'] = state['note'] or reason
        child.kill()

    def forward(stream, kind):
        for line in stream:
            with lock:
                state['size'] += len(line)
                over = state['size'] > MAX_OUTPUT
            if over:
                stop('ผลลัพธ์ยาวเกิน 1 MB')
                return
            on_data(kind, line)

    readers = [
        threading.Thread(target=forward, args=(child.stdout, 'out'), daemon=True),
        threading.Thread(target=forward, args=(child.stderr, 'err'), daemon=True),
    ]
    for reader in readers:
        reader.start()

    elapsed = 0.0
    while child.poll() is None:
        try:
            child.wait(0.05)
        except subprocess.TimeoutExpired:
            pass
        elapsed += 0.05
        if cancel is not None and cancel.is_set():
            stop('ยกเลิกแล้ว')
        elif elapsed >= timeout:
            stop(f'หมดเวลา {timeout:g} วินาที')
    for reader in readers:
        reader.join(1)
    child.stdout.close()
    child.stderr.close()
    return child.returncode, state['note']


def demo_output(machine, command):
    first = command.split()[0]
    known = {
        'hostname': machine['name'],
        'whoami': 'demo',
        'uptime': ' 15:08:26 up 12 days,  3:41,  1 user,  load average: 0.08, 0.12, 0.09',
        'date': datetime.now().strftime('%a %b %d %H:%M:%S %Y'),
        'df': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        80G   31G   46G  41% /',
        'free': '               total        used        free\nMem:            8000        2710        5290',
    }
    return known.get(first, f'(จำลอง) ไม่ได้รันจริง: {command}')


def run_command(machine, command, on_data, cancel=None):
    if machine.get('demo'):
        on_data('out', f'{demo_output(machine, command)}\n')
        return 0, None
    return stream_process(command_target(machine, command), on_data, cancel)
