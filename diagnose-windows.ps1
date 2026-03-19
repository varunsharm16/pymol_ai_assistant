$ErrorActionPreference = 'Continue'

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " PyMOL AI Assistant - Windows Diagnostics"
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# ---- Environment ----
Write-Host "---- Environment ----" -ForegroundColor Yellow
Write-Host "  USERPROFILE:  $env:USERPROFILE"
Write-Host "  HOME:         $env:HOME"
Write-Host "  HOMEDRIVE:    $env:HOMEDRIVE"
Write-Host "  HOMEPATH:     $env:HOMEPATH"
Write-Host "  APPDATA:      $env:APPDATA"
Write-Host ""

# ---- Python home() ----
Write-Host "---- Python Path.home() ----" -ForegroundColor Yellow
$pythonCmd = $null
foreach ($candidate in @('python', 'py')) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $pythonCmd = $candidate
        break
    }
}
if ($pythonCmd) {
    $pythonHome = & $pythonCmd -c "from pathlib import Path; print(Path.home())" 2>&1
    Write-Host "  Python reports home as: $pythonHome"
    if ($pythonHome -ne $env:USERPROFILE) {
        Write-Host "  WARNING: Python Path.home() differs from USERPROFILE!" -ForegroundColor Red
        Write-Host "  This is likely the root cause of plugin loading failure."
    } else {
        Write-Host "  OK: Matches USERPROFILE" -ForegroundColor Green
    }
} else {
    Write-Host "  WARNING: Python not found on PATH" -ForegroundColor Red
}
Write-Host ""

# ---- pymolrc files ----
Write-Host "---- Startup RC Files ----" -ForegroundColor Yellow
$rcCandidates = @()
foreach ($base in @($env:USERPROFILE, $env:HOME, "$env:HOMEDRIVE$env:HOMEPATH")) {
    if (-not $base) { continue }
    $rcCandidates += Join-Path $base "pymolrc"
    $rcCandidates += Join-Path $base "pymolrc.pml"
    $rcCandidates += Join-Path $base ".pymolrc"
}
$rcCandidates = $rcCandidates | Select-Object -Unique

$foundRc = $false
foreach ($rc in $rcCandidates) {
    if (Test-Path $rc) {
        $content = Get-Content $rc -Raw -ErrorAction SilentlyContinue
        $hasBlock = $content -match 'PyMOL AI Assistant \(managed\)'
        $status = if ($hasBlock) { "contains managed block" } else { "EXISTS but NO managed block" }
        $color = if ($hasBlock) { "Green" } else { "Red" }
        Write-Host "  [FOUND] $rc - $status" -ForegroundColor $color
        $foundRc = $true
    } else {
        Write-Host "  [    ] $rc - not found" -ForegroundColor DarkGray
    }
}
if (-not $foundRc) {
    Write-Host "  WARNING: No pymolrc file found anywhere!" -ForegroundColor Red
    Write-Host "  The installer may not have written the startup hook."
}
Write-Host ""

# ---- Plugin directory ----
Write-Host "---- Plugin Files ----" -ForegroundColor Yellow
$pluginDir = Join-Path $env:USERPROFILE ".pymol\Plugins\pymol_ai_assistant"
$initPy = Join-Path $pluginDir "__init__.py"
$cmdModel = Join-Path $pluginDir "command_model.py"

if (Test-Path $pluginDir) {
    Write-Host "  [OK] Plugin dir exists: $pluginDir" -ForegroundColor Green
} else {
    Write-Host "  [X]  Plugin dir MISSING: $pluginDir" -ForegroundColor Red
}

if (Test-Path $initPy) {
    $size = (Get-Item $initPy).Length
    Write-Host "  [OK] __init__.py exists ($size bytes)" -ForegroundColor Green
} else {
    Write-Host "  [X]  __init__.py MISSING" -ForegroundColor Red
}

if (Test-Path $cmdModel) {
    Write-Host "  [OK] command_model.py exists" -ForegroundColor Green
} else {
    Write-Host "  [X]  command_model.py MISSING" -ForegroundColor Red
}
Write-Host ""

# ---- Config file ----
Write-Host "---- Config File ----" -ForegroundColor Yellow
$configFile = Join-Path $env:USERPROFILE ".pymol\config.json"
if (Test-Path $configFile) {
    Write-Host "  [OK] config.json exists: $configFile" -ForegroundColor Green
    try {
        $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
        $projectRoot = $cfg.project_root
        if ($projectRoot) {
            Write-Host "  project_root: $projectRoot"
            $bridgeDir = Join-Path $projectRoot "pymol-bridge"
            if (Test-Path $bridgeDir) {
                Write-Host "  [OK] pymol-bridge/ found at project root" -ForegroundColor Green
            } else {
                Write-Host "  [X]  pymol-bridge/ NOT found at project root" -ForegroundColor Red
            }
        } else {
            Write-Host "  [X]  project_root is not set" -ForegroundColor Red
        }
        if ($cfg.node_path) { Write-Host "  node_path: $($cfg.node_path)" }
        if ($cfg.npm_path) { Write-Host "  npm_path: $($cfg.npm_path)" }
    } catch {
        Write-Host "  [X]  Failed to parse config.json: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  [X]  config.json MISSING: $configFile" -ForegroundColor Red
}
Write-Host ""

# ---- Legacy loaders (should not exist) ----
Write-Host "---- Legacy Loader Check ----" -ForegroundColor Yellow
$legacyPaths = @(
    (Join-Path $env:USERPROFILE ".pymol\startup\pymol_ai_assistant_startup.py"),
    (Join-Path $env:USERPROFILE ".pymol\startup\pymol_ai_assistant")
)
if ($env:APPDATA) {
    $legacyPaths += Join-Path $env:APPDATA "PyMOL\Startup\pymol_ai_assistant_startup.py"
    $legacyPaths += Join-Path $env:APPDATA "PyMOL\Startup\pymol_ai_assistant"
}

$hasLegacy = $false
foreach ($lp in $legacyPaths) {
    if (Test-Path $lp) {
        Write-Host "  [!] Legacy loader still exists: $lp" -ForegroundColor Red
        $hasLegacy = $true
    }
}
if (-not $hasLegacy) {
    Write-Host "  [OK] No legacy loaders found" -ForegroundColor Green
}
Write-Host ""

# ---- Summary ----
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Diagnostics complete. Share this output"
Write-Host " if you need help troubleshooting."
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
