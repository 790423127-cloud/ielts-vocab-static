@echo off
setlocal
title IELTS Vocab Launcher
cd /d "%~dp0"

set "SCRIPT=%~dp0restart-vocab-service.ps1"

if not exist "%SCRIPT%" (
    echo [ERROR] Missing:
    echo %SCRIPT%
    echo Keep start-windows.bat and restart-vocab-service.ps1 in the same folder.
    pause
    exit /b 2
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] Startup failed with exit code %EXIT_CODE%.
    pause
)

endlocal & exit /b %EXIT_CODE%
