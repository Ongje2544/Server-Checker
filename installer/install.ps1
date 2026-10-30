# Per-user install: no admin rights, nothing outside the user's profile.
# Machines and logs live in %APPDATA%\VPS Monitor, so an upgrade never touches them.
param(
  [string]$Root = (Join-Path $env:LOCALAPPDATA 'VPSMonitor'),
  [switch]$NoShortcuts
)
$ErrorActionPreference = 'Stop'
$app = Join-Path $Root 'app'
$exe = Join-Path $app 'VPS Monitor.exe'

if (-not $NoShortcuts) {
  Get-Process 'VPS Monitor' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
}
if (Test-Path $app) { Remove-Item -Recurse -Force $app }
New-Item -ItemType Directory -Force $app | Out-Null
tar -xf (Join-Path $PSScriptRoot 'payload.tar') -C $app
if ($LASTEXITCODE -ne 0) { throw 'Could not unpack the application files.' }
if ($NoShortcuts) { return }

$shell = New-Object -ComObject WScript.Shell
function Add-Shortcut($path) {
  $link = $shell.CreateShortcut($path)
  $link.TargetPath = $exe
  $link.WorkingDirectory = $app
  $link.Description = 'VPS Monitor'
  $link.Save()
}
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'VPS Monitor'
New-Item -ItemType Directory -Force $menu | Out-Null
Add-Shortcut (Join-Path $menu 'VPS Monitor.lnk')
Add-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'VPS Monitor.lnk')

$posh = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$uninstall = Join-Path $app 'uninstall.ps1'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VPSMonitor'
New-Item -Path $key -Force | Out-Null
$values = @{
  DisplayName = 'VPS Monitor'
  DisplayVersion = '2.0.0'
  Publisher = 'Ongje2544'
  DisplayIcon = $exe
  InstallLocation = $app
  UninstallString = "`"$posh`" -NoProfile -ExecutionPolicy Bypass -File `"$uninstall`""
}
foreach ($name in $values.Keys) { Set-ItemProperty -Path $key -Name $name -Value $values[$name] }
Set-ItemProperty -Path $key -Name NoModify -Value 1 -Type DWord
Set-ItemProperty -Path $key -Name NoRepair -Value 1 -Type DWord

Start-Process $exe
