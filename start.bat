@echo off
chcp 65001 >nul
cd /d "%~dp0"

set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set HF_HUB_DISABLE_PROGRESS_BARS=1
set TOKENIZERS_PARALLELISM=false
set HF_ENDPOINT=https://hf-mirror.com

echo Stopping old server if any...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run_web.ps1" -StopOnly >nul 2>&1

echo ========================================
echo   AIKnowlageMessage Web Server
echo ========================================
echo URL: http://127.0.0.1:5000
echo Press Ctrl+C to stop
echo.

if not exist "D:\ANACONDA\envs\user-kb-model\python.exe" (
    echo [ERROR] Python not found: D:\ANACONDA\envs\user-kb-model\python.exe
    echo Run: conda env create -f environment.yml
    pause
    exit /b 1
)

D:\ANACONDA\envs\user-kb-model\python.exe scripts\web_app.py
if errorlevel 1 (
    echo.
    echo [ERROR] Web server exited with an error.
    pause
)
