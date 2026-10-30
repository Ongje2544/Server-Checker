import re
import socket
import subprocess
import sys
import time

IS_WINDOWS = sys.platform == 'win32'
NO_WINDOW = subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0


def parse_ping(stdout, exit_ok, host):
    # TTL is the reliable marker: Windows ping exits 0 on "Destination host
    # unreachable", and the word stays in English on localized Windows.
    if not exit_ok:
        return {'ok': False}
    if ':' not in host and not re.search(r'ttl=', stdout, re.I):
        return {'ok': False}
    match = re.search(r'time[=<]\s*([\d.]+)', stdout, re.I)
    return {'ok': True, 'latencyMs': float(match.group(1)) if match else None}


def ping(host, timeout_ms):
    if IS_WINDOWS:
        args = ['ping', '-n', '1', '-w', str(timeout_ms), host]
    else:
        args = ['ping', '-c', '1', '-W', str(max(1, -(-timeout_ms // 1000))), host]
    started = time.perf_counter()
    try:
        done = subprocess.run(
            args, capture_output=True, text=True, errors='replace',
            timeout=timeout_ms / 1000 + 2, creationflags=NO_WINDOW,
        )
    except (subprocess.TimeoutExpired, OSError):
        return {'ok': False}
    result = parse_ping(done.stdout, done.returncode == 0, host)
    if result['ok'] and result['latencyMs'] is None:
        result['latencyMs'] = round((time.perf_counter() - started) * 1000)
    return result


def tcp_connect(host, port, timeout_ms):
    started = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout_ms / 1000):
            return {'ok': True, 'latencyMs': round((time.perf_counter() - started) * 1000)}
    except OSError:
        return {'ok': False}


def probe(machine, timeout_ms):
    # Many VPS providers drop ICMP, so a configured TCP port counts as a second opinion.
    result = ping(machine['host'], timeout_ms)
    if result['ok']:
        return {**result, 'via': 'ping'}
    if machine.get('tcpPort'):
        result = tcp_connect(machine['host'], machine['tcpPort'], timeout_ms)
        if result['ok']:
            return {**result, 'via': f"tcp:{machine['tcpPort']}"}
    return {'ok': False}
