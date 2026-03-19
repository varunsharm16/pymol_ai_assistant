@echo off
setlocal
REM PyMOL AI Assistant — Installer for Windows
REM Usage: install.bat

echo.
echo ======================================
echo  PyMOL AI Assistant — Installer
echo ======================================
echo.

REM ---- Check Python ----
set PYTHON_CMD=python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    py --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [X] Python is required. Install 3.8+ from https://python.org
        exit /b 1
    )
    set PYTHON_CMD=py
)
for /f "tokens=2 delims= " %%a in ('%PYTHON_CMD% --version 2^>^&1') do set PYVER=%%a
echo [OK] Python: %PYVER%

REM ---- Check Node.js ----
set "NODE_PATH="
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Node.js is required. Install v18+ from https://nodejs.org
    exit /b 1
)
for /f %%a in ('node --version') do set NODEVER=%%a
for /f "delims=" %%a in ('where.exe node.exe 2^>nul') do (
    if not defined NODE_PATH set "NODE_PATH=%%a"
)
if not defined NODE_PATH (
    echo [X] Could not resolve node.exe on PATH
    exit /b 1
)
echo [OK] Node.js: %NODEVER%

REM ---- Check npm ----
set "NPM_PATH="
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] npm is required (comes with Node.js)
    exit /b 1
)
for /f "delims=" %%a in ('where.exe npm.cmd 2^>nul') do (
    if not defined NPM_PATH set "NPM_PATH=%%a"
)
if not defined NPM_PATH (
    for /f "delims=" %%a in ('where.exe npm 2^>nul') do (
        if not defined NPM_PATH set "NPM_PATH=%%a"
    )
)
if not defined NPM_PATH (
    echo [X] Could not resolve npm on PATH
    exit /b 1
)
echo [OK] npm found

echo.

REM ---- Step 1: Bridge server ----
echo [1/3] Setting up bridge server...
cd /d "%~dp0pymol-bridge"
if not exist ".venv" (
    %PYTHON_CMD% -m venv .venv
)
call .venv\Scripts\activate.bat
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
call deactivate
echo [OK] Bridge dependencies installed

REM ---- Step 2: Electron UI ----
echo [2/3] Setting up Electron UI...
cd /d "%~dp0pymol-ai-electron-ui"
call npm install --silent 2>nul || call npm install
call npm run build
call npm run build:electron
echo [OK] Electron UI dependencies installed

REM ---- Step 3: PyMOL plugin ----
echo [3/3] Installing PyMOL plugin...
set PLUGIN_SRC=%~dp0plugin
set PYMOL_ROOT=%USERPROFILE%\.pymol

echo [INFO] USERPROFILE = %USERPROFILE%
echo [INFO] Plugin source = %PLUGIN_SRC%
echo [INFO] PyMOL user root = %PYMOL_ROOT%

if not exist "%PLUGIN_SRC%\__init__.py" (
    echo [X] Plugin source is missing __init__.py at %PLUGIN_SRC%
    exit /b 1
)
if not exist "%PLUGIN_SRC%\command_model.py" (
    echo [X] Plugin source is missing command_model.py at %PLUGIN_SRC%
    exit /b 1
)

REM Copy plugin into ~/.pymol/Plugins
set PLUGIN_HOME=%PYMOL_ROOT%\Plugins
if not exist "%PLUGIN_HOME%" mkdir "%PLUGIN_HOME%"
if errorlevel 1 (
    echo [X] Failed to create plugin home at %PLUGIN_HOME%
    exit /b 1
)

set PLUGIN_DIR=%PLUGIN_HOME%\pymol_ai_assistant

%PYTHON_CMD% -c "import pathlib, shutil, sys; src=pathlib.Path(r'%PLUGIN_SRC%'); dst=pathlib.Path(r'%PLUGIN_DIR%'); dst.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(dst, ignore_errors=True); shutil.copytree(src, dst)"
if errorlevel 1 (
    echo [X] Failed to copy plugin from %PLUGIN_SRC% to %PLUGIN_DIR%
    exit /b 1
)

if not exist "%PLUGIN_DIR%\__init__.py" (
    echo [X] Plugin copy failed: __init__.py missing at %PLUGIN_DIR%
    dir "%PLUGIN_HOME%" 2>nul
    exit /b 1
)
if not exist "%PLUGIN_DIR%\command_model.py" (
    echo [X] Plugin copy failed: command_model.py missing at %PLUGIN_DIR%
    dir "%PLUGIN_DIR%" 2>nul
    exit /b 1
)

echo [OK] Plugin copied to: %PLUGIN_DIR%
dir "%PLUGIN_DIR%"

for /f "delims=" %%a in ('%PYTHON_CMD% "%~dp0scripts\manage_pymol_startup.py" --install --verbose') do echo %%a
if errorlevel 1 (
    echo [X] Failed to configure PyMOL startup hooks
    exit /b 1
)

REM ---- Write project root to config ----
set CONFIG_DIR=%PYMOL_ROOT%
set CONFIG_FILE=%CONFIG_DIR%\config.json
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"
%PYTHON_CMD% -c "import json,pathlib;p=pathlib.Path(r'%CONFIG_FILE%');cfg=json.loads(p.read_text()) if p.exists() else {};cfg['project_root']=r'%~dp0'.rstrip('\\');cfg['node_path']=r'%NODE_PATH%';cfg['npm_path']=r'%NPM_PATH%';p.write_text(json.dumps(cfg,indent=2))"
if errorlevel 1 (
    echo [X] Failed to write config.json at %CONFIG_FILE%
    exit /b 1
)
echo [OK] Project root saved to %CONFIG_FILE%

echo.
echo ---- Post-install verification ----
echo.

REM Verify plugin files
if exist "%PLUGIN_DIR%\__init__.py" (
    echo [OK] Plugin __init__.py found at %PLUGIN_DIR%
) else (
    echo [X] Plugin __init__.py MISSING at %PLUGIN_DIR%
    exit /b 1
)

if exist "%PLUGIN_DIR%\command_model.py" (
    echo [OK] command_model.py found
) else (
    echo [X] command_model.py MISSING at %PLUGIN_DIR%
    exit /b 1
)

REM Verify pymolrc files have the managed block
set RC_FOUND=0
if exist "%USERPROFILE%\pymolrc" (
    findstr /C:"PyMOL AI Assistant (managed)" "%USERPROFILE%\pymolrc" >nul 2>&1
    if not errorlevel 1 (
        echo [OK] Startup hook found in %USERPROFILE%\pymolrc
        set RC_FOUND=1
    ) else (
        echo [!] %USERPROFILE%\pymolrc exists but does NOT contain the managed block
    )
)
if exist "%USERPROFILE%\pymolrc.pml" (
    findstr /C:"PyMOL AI Assistant (managed)" "%USERPROFILE%\pymolrc.pml" >nul 2>&1
    if not errorlevel 1 (
        echo [OK] Startup hook found in %USERPROFILE%\pymolrc.pml
        set RC_FOUND=1
    ) else (
        echo [!] %USERPROFILE%\pymolrc.pml exists but does NOT contain the managed block
    )
)
if %RC_FOUND% equ 0 (
    echo [!] WARNING: No pymolrc file with startup hook found.
    echo [!] PyMOL may not load the plugin automatically.
)

REM Verify config.json
if exist "%CONFIG_FILE%" (
    echo [OK] config.json exists at %CONFIG_FILE%
) else (
    echo [X] config.json MISSING at %CONFIG_FILE%
    exit /b 1
)

echo.
echo ======================================
echo  Installation complete!
echo ======================================
echo.
echo   1. Open PyMOL
echo   2. Type: ai
echo   3. That's it! PyMOL will auto-load the assistant on startup.
echo.
echo   First time? Enter your OpenAI API key in the Settings panel.
echo.
echo   Having trouble? Run this in PowerShell:
echo     powershell -ExecutionPolicy Bypass -File "%~dp0diagnose-windows.ps1"
echo.
pause
