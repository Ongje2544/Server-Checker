"""Builds dist/setup.exe: PyInstaller for the app, IExpress (part of Windows) for the installer."""
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent
INSTALLER = PROJECT / 'installer'
TARGET = PROJECT / 'dist' / 'setup.exe'
WORK = Path(tempfile.gettempdir()) / 'vpsmon-build'
EXCLUDES = ['tkinter', 'unittest', 'pydoc', 'test', 'lib2to3', 'PIL.ImageQt', 'numpy']

SED = r"""[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=Install VPS Monitor?
DisplayLicense=
FinishMessage=VPS Monitor is installed.
TargetName={target}
FriendlyName=VPS Monitor Setup
AppLaunched=cmd.exe /c install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="install.cmd"
FILE1="install.ps1"
FILE2="payload.tar"
[SourceFiles]
SourceFiles0={work}\
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
"""


def freeze():
    icon = WORK / 'icon.ico'
    Image.open(PROJECT / 'public' / 'icon.png').save(icon, sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
    command = [
        sys.executable, '-m', 'PyInstaller', str(PROJECT / 'main.py'), '--noconfirm', '--windowed',
        '--name', 'VPS Monitor', '--icon', str(icon),
        '--add-data', f"{PROJECT / 'public'}{os.pathsep}public",
        '--hidden-import', 'pystray._win32',
        '--distpath', str(WORK / 'out'), '--workpath', str(WORK / 'work'), '--specpath', str(WORK),
    ]
    for name in EXCLUDES:
        command += ['--exclude-module', name]
    subprocess.run(command, check=True, cwd=PROJECT)
    return WORK / 'out' / 'VPS Monitor'


def package(app):
    shutil.copy(INSTALLER / 'uninstall.ps1', app)
    with tarfile.open(WORK / 'payload.tar', 'w') as tar:
        tar.add(app, arcname='.')
    for name in ('install.cmd', 'install.ps1'):
        shutil.copy(INSTALLER / name, WORK)
    TARGET.parent.mkdir(exist_ok=True)
    TARGET.unlink(missing_ok=True)
    sed = WORK / 'setup.sed'
    sed.write_text(SED.format(target=TARGET, work=WORK), 'ascii')
    iexpress = Path(os.environ['SystemRoot']) / 'System32' / 'iexpress.exe'
    subprocess.run([str(iexpress), '/N', '/Q', str(sed)], check=True)
    if not TARGET.exists():
        raise SystemExit('IExpress did not create setup.exe')


def main():
    shutil.rmtree(WORK, ignore_errors=True)
    WORK.mkdir(parents=True)
    package(freeze())
    shutil.rmtree(WORK, ignore_errors=True)
    print(f'Built {TARGET} ({TARGET.stat().st_size / 1024 / 1024:.1f} MB)')


if __name__ == '__main__':
    main()
