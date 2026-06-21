@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

cd /d "%~dp0"

set "CONDA_ROOT=D:\ANACONDA"
set "ENV_NAME=user-kb-model"
set "PYTHON_EXE=%CONDA_ROOT%\envs\%ENV_NAME%\python.exe"

if not exist "%PYTHON_EXE%" (
    echo [ERROR] Not found: %PYTHON_EXE%
    echo Create env first: conda env create -f environment.yml
    pause
    exit /b 1
)

echo ========================================
echo   AIKnowlageMessage Web Server
echo ========================================
echo.
echo Python: %PYTHON_EXE%
"%PYTHON_EXE%" --version
echo.
echo URL: http://127.0.0.1:5000
echo Press Ctrl+C to stop
echo.

"%PYTHON_EXE%" scripts\web_app.py

echo.
pause
