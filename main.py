import ctypes
import os
import sys
import threading
import urllib.request
from pathlib import Path

import pystray
import webview
from PIL import Image

from app.server import App, ROOT

# Fixed so the page's origin, and with it the saved theme, stays the same between runs.
PREVIEW = '--preview' in sys.argv
PORT = 38788 if PREVIEW else 38787
ORIGIN = f'http://127.0.0.1:{PORT}'
MUTEX_NAME = 'VPSMonitorPreview' if PREVIEW else 'VPSMonitorDesktopApp'
TITLE = 'VPS Monitor (Preview)' if PREVIEW else 'VPS Monitor'
ERROR_ALREADY_EXISTS = 183


def user_dir():
    # Preview keeps its own demo data, so it can run beside the installed app
    # without double pings, double schedules or commands to real machines.
    base = Path(os.environ.get('APPDATA') or Path.home())
    return base / ('VPS Monitor Preview' if PREVIEW else 'VPS Monitor')


def already_running():
    ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
    return ctypes.windll.kernel32.GetLastError() == ERROR_ALREADY_EXISTS


def show_running_window():
    request = urllib.request.Request(f'{ORIGIN}/api/window/show', data=b'{}', method='POST', headers={
        'Content-Type': 'application/json', 'X-VPS-Monitor': '1',
    })
    try:
        urllib.request.urlopen(request, timeout=3)
    except OSError:
        pass


def show_error(message):
    ctypes.windll.user32.MessageBoxW(None, message, 'VPS Monitor', 0x10)


def main():
    if already_running():
        show_running_window()
        return

    quitting = threading.Event()
    window = None

    def show():
        if window:
            window.show()
            window.restore()

    try:
        app = App(user_dir() / 'data', port=PORT, on_show=show)
    except OSError as err:
        show_error(f'เปิดโปรแกรมไม่ได้: {err}')
        return
    app.start()

    window = webview.create_window(
        TITLE, ORIGIN, width=1440, height=900, min_size=(900, 600), background_color='#F1F3F6',
    )

    def on_closing():
        # Closing keeps pings and schedules running; the tray menu really quits.
        if quitting.is_set():
            return True
        window.hide()
        return False

    def quit_app(icon):
        quitting.set()
        icon.stop()
        window.destroy()

    window.events.closing += on_closing
    tray = pystray.Icon(TITLE, Image.open(ROOT / 'public' / 'icon.png'), TITLE, pystray.Menu(
        pystray.MenuItem('เปิด VPS Monitor', lambda: show(), default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('ออกจากโปรแกรม', quit_app),
    ))
    tray.run_detached()

    webview.settings['ALLOW_DOWNLOADS'] = True
    webview.start(private_mode=False, storage_path=str(user_dir() / 'webview'))
    app.stop()
    sys.exit(0)


if __name__ == '__main__':
    main()
