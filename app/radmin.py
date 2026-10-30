import ntpath
import os
import subprocess

from .store import HttpError

DEFAULT_RADMIN_PORT = 4899


def find_radmin(env=None, exists=os.path.isfile):
    env = os.environ if env is None else env
    for root in (env.get('ProgramFiles(x86)'), env.get('ProgramFiles')):
        if root:
            path = ntpath.join(root, 'Radmin Viewer 3', 'Radmin.exe')
            if exists(path):
                return path
    return None


def radmin_args(machine):
    port = (machine.get('remote') or {}).get('radminPort') or DEFAULT_RADMIN_PORT
    return [f"/connect:{machine['host']}:{port}"]


def open_radmin(machine):
    if not machine.get('host'):
        raise HttpError(400, 'เครื่องนี้ยังไม่ได้ตั้ง IP')
    viewer = find_radmin()
    if not viewer:
        raise HttpError(400, 'ไม่พบ Radmin Viewer 3 บนเครื่องนี้')
    subprocess.Popen([viewer, *radmin_args(machine)], close_fds=True)
