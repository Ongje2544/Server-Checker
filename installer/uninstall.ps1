# Removes the program and its shortcuts. %APPDATA%\VPS Monitor is kept so machines
# and the audit log are not lost by accident.
$app = $PSScriptRoot
Get-Process 'VPS Monitor' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

Remove-Item -Recurse -Force (Join-Path ([Environment]::GetFolderPath('Programs')) 'VPS Monitor') -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path ([Environment]::GetFolderPath('Desktop')) 'VPS Monitor.lnk') -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VPSMonitor' -Recurse -ErrorAction SilentlyContinue

Add-Type -AssemblyName System.Windows.Forms
[void][Windows.Forms.MessageBox]::Show("VPS Monitor was removed.`nYour data is still in:`n$env:APPDATA\VPS Monitor", 'VPS Monitor')

# This script lives inside the app folder, so a separate process deletes it after exit.
Start-Process cmd.exe -ArgumentList "/c timeout /t 2 /nobreak >nul & rmdir /s /q `"$app`"" -WindowStyle Hidden
