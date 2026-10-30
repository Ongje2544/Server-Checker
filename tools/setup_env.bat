@echo off
rem Creates the shared Python environment on first use. It lives outside the
rem project so the project folder stays small and long paths are not a problem.
set "VENV=%LOCALAPPDATA%\VPSMonitorDev\venv"
if exist "%VENV%\Scripts\python.exe" goto install
echo Creating Python environment...
where py >nul 2>nul
if %errorlevel%==0 (py -3 -m venv "%VENV%") else (python -m venv "%VENV%")
if errorlevel 1 (
  echo Python 3.11 or newer is required: https://www.python.org/downloads/
  exit /b 1
)
:install
"%VENV%\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r "%~dp0..\requirements.txt"
if errorlevel 1 exit /b 1
exit /b 0
