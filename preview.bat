@echo off
rem Opens the app from source with demo data. Real machines are never touched.
cd /d "%~dp0"
call tools\setup_env.bat
if errorlevel 1 goto failed
"%VENV%\Scripts\python.exe" main.py --preview
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Preview failed.
pause
exit /b 1
