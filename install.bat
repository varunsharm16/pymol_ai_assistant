@echo off
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
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Node.js is required. Install v18+ from https://nodejs.org
    exit /b 1
)
for /f %%a in ('node --version') do set NODEVER=%%a
for /f "delims=" %%a in ('where node') do (
    set NODE_PATH=%%a
    goto :node_path_done
)
:node_path_done
echo [OK] Node.js: %NODEVER%

REM ---- Check npm ----
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] npm is required (comes with Node.js)
    exit /b 1
)
for /f "delims=" %%a in ('where npm') do (
    set NPM_PATH=%%a
    goto :npm_path_done
)
:npm_path_done
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

REM Copy plugin into ~/.pymol/Plugins
set PLUGIN_HOME=%USERPROFILE%\.pymol\Plugins
if not exist "%PLUGIN_HOME%" mkdir "%PLUGIN_HOME%"

set PLUGIN_DIR=%PLUGIN_HOME%\pymol_ai_assistant
if exist "%PLUGIN_DIR%" (
    echo [!] Plugin directory already exists — replacing
    rmdir /s /q "%PLUGIN_DIR%"
)
xcopy "%PLUGIN_SRC%" "%PLUGIN_DIR%" /E /I /Q >nul
echo [OK] Plugin copied to: %PLUGIN_DIR%
for /f "delims=" %%a in ('%PYTHON_CMD% "%~dp0scripts\manage_pymol_startup.py" --install --verbose') do echo %%a

REM ---- Write project root to config ----
set CONFIG_DIR=%USERPROFILE%\.pymol
set CONFIG_FILE=%CONFIG_DIR%\config.json
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"
%PYTHON_CMD% -c "import json,pathlib;p=pathlib.Path(r'%CONFIG_FILE%');cfg=json.loads(p.read_text()) if p.exists() else {};cfg['project_root']=r'%~dp0'.rstrip('\\');cfg['node_path']=r'%NODE_PATH%';cfg['npm_path']=r'%NPM_PATH%';p.write_text(json.dumps(cfg,indent=2))"
echo [OK] Project root saved to %CONFIG_FILE%

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
pause
