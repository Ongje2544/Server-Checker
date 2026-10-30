@echo off
rem Runs the tests, then exports dist\setup.exe.
cd /d "%~dp0"
call tools\setup_env.bat
if errorlevel 1 goto failed
"%VENV%\Scripts\python.exe" -m unittest discover -s tests
if errorlevel 1 goto failed
"%VENV%\Scripts\python.exe" tools\build_setup.py
if errorlevel 1 goto failed
echo.
echo Done: dist\setup.exe
pause
exit /b 0
:failed
echo.
echo Build failed.
pause
exit /b 1
