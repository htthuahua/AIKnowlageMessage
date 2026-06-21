@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

echo === 1. 训练模型 ===
D:\ANACONDA\envs\user-kb-model\python.exe scripts\train.py --epochs 5
if errorlevel 1 exit /b 1

echo.
echo === 2. 运行 Demo ===
D:\ANACONDA\envs\user-kb-model\python.exe scripts\demo.py
pause
