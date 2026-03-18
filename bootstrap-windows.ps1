$ErrorActionPreference = 'Stop'

function Write-Info($Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn($Message) {
    Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Write-Err($Message) {
    Write-Host "[X] $Message" -ForegroundColor Red
}

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $combined = @($machinePath, $userPath) | Where-Object { $_ -and $_.Trim() } | Select-Object -Unique
    if ($combined.Count -gt 0) {
        $env:Path = ($combined -join ';')
    }
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Network {
    try {
        Invoke-WebRequest -Uri "https://github.com" -Method Head -TimeoutSec 15 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Get-PackageManager {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        return "winget"
    }
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        return "choco"
    }
    return $null
}

function Ensure-ElevatedForInstall($Label) {
    if (-not (Test-IsAdmin)) {
        throw "$Label is missing. To continue, open PowerShell as Administrator and run this bootstrap again."
    }
}

function Install-Package($Manager, $WingetId, $ChocoName, $Label) {
    Ensure-ElevatedForInstall $Label
    if ($Manager -eq "winget") {
        & winget install --id $WingetId -e --accept-package-agreements --accept-source-agreements --silent
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install $Label with winget. Command: winget install --id $WingetId -e"
        }
        Refresh-Path
        return
    }
    if ($Manager -eq "choco") {
        & choco install $ChocoName -y
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install $Label with Chocolatey. Command: choco install $ChocoName -y"
        }
        Refresh-Path
        return
    }
    throw "No supported package manager available to install $Label."
}

function Get-PythonInfo {
    foreach ($candidate in @('python', 'py')) {
        if (-not (Get-Command $candidate -ErrorAction SilentlyContinue)) {
            continue
        }
        try {
            $versionText = & $candidate --version 2>&1
            if ($LASTEXITCODE -eq 0 -and $versionText -match '(\d+)\.(\d+)') {
                return [PSCustomObject]@{
                    Command = $candidate
                    VersionText = $versionText
                    Major = [int]$Matches[1]
                    Minor = [int]$Matches[2]
                }
            }
        } catch {}
    }
    return $null
}

function Test-PythonOk {
    $pythonInfo = Get-PythonInfo
    if (-not $pythonInfo) { return $false }
    return ($pythonInfo.Major -gt 3) -or ($pythonInfo.Major -eq 3 -and $pythonInfo.Minor -ge 8)
}

function Ensure-Git($Manager) {
    Write-Host ""
    Write-Host "Checking Git..."
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Install-Package $Manager "Git.Git" "git" "Git"
    }
    $gitVersion = & git --version 2>&1
    Write-Info "Git: $gitVersion"
}

function Ensure-Python($Manager) {
    Write-Host ""
    Write-Host "Checking Python..."
    if (-not (Test-PythonOk)) {
        Install-Package $Manager "Python.Python.3.12" "python" "Python 3.8+"
    }
    $pythonInfo = Get-PythonInfo
    if (-not $pythonInfo) {
        throw "Python installation completed, but Python is still not available on PATH."
    }
    Write-Info "Python: $($pythonInfo.VersionText)"
    if ($pythonInfo.Command -eq 'py' -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
        Write-Warn "Python is available through the Windows 'py' launcher but not as 'python'. install.bat will use the 'py' fallback."
    }
}

function Ensure-Node($Manager) {
    Write-Host ""
    Write-Host "Checking Node.js..."
    $nodeOk = $false
    if (Get-Command node -ErrorAction SilentlyContinue) {
        try {
            $nodeVersion = & node --version 2>&1
            if ($LASTEXITCODE -eq 0 -and $nodeVersion -match 'v?(\d+)') {
                $nodeOk = ([int]$Matches[1] -ge 18)
            }
        } catch {}
    }
    $npmOk = [bool](Get-Command npm -ErrorAction SilentlyContinue)

    if (-not $nodeOk -or -not $npmOk) {
        Install-Package $Manager "OpenJS.NodeJS.LTS" "nodejs-lts" "Node.js 18+"
    }

    $nodeVersion = & node --version 2>&1
    $npmVersion = & npm --version 2>&1
    Write-Info "Node.js: $nodeVersion"
    Write-Info "npm: $npmVersion"
}

function Test-PyMOLInstalled {
    # Phase 1: Fast check of common install locations
    $candidates = @(
        (Join-Path $env:ProgramFiles "PyMOL\PyMOLWin.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "PyMOL\PyMOLWin.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\PyMOL\PyMOLWin.exe"),
        (Join-Path $env:USERPROFILE "AppData\Local\Programs\PyMOL\PyMOLWin.exe"),
        (Join-Path $env:USERPROFILE "Desktop\PyMOL\PyMOLWin.exe"),
        (Join-Path $env:USERPROFILE "Downloads\PyMOL\PyMOLWin.exe"),
        (Join-Path $env:USERPROFILE "OneDrive\Desktop\PyMOL\PyMOLWin.exe"),
        (Join-Path $env:USERPROFILE "OneDrive\Downloads\PyMOL\PyMOLWin.exe")
    ) | Where-Object { $_ }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $true }
    }

    # Check Schrodinger suite installs
    $schrodingerRoots = @(
        (Join-Path $env:ProgramFiles "Schrodinger"),
        (Join-Path ${env:ProgramFiles(x86)} "Schrodinger")
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($root in $schrodingerRoots) {
        $match = Get-ChildItem -Path $root -Directory -Filter "PyMOL*" -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName "PyMOLWin.exe" } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1
        if ($match) { return $true }
    }

    # Phase 2: Broad recursive search across priority folders, then all fixed drives
    Write-Host "  PyMOL not found in common locations. Searching the entire computer (this may take a moment)..." -ForegroundColor Yellow

    $priorityRoots = @(
        $env:USERPROFILE,
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)},
        $env:LOCALAPPDATA,
        $env:APPDATA
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

    foreach ($root in $priorityRoots) {
        $found = Get-ChildItem -Path $root -Recurse -Filter "PyMOLWin.exe" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) {
            Write-Host "  Found PyMOL at: $($found.FullName)" -ForegroundColor Green
            return $true
        }
    }

    # Last resort: search all fixed drives
    $drives = Get-PSDrive -PSProvider FileSystem | Where-Object {
        $_.Root -and (Test-Path $_.Root) -and ([System.IO.DriveInfo]::new($_.Root).DriveType -eq 'Fixed')
    }

    foreach ($drive in $drives) {
        $driveRoot = $drive.Root
        # Skip roots we already searched
        $alreadySearched = $priorityRoots | Where-Object { $_ -and $_.StartsWith($driveRoot) }
        $found = Get-ChildItem -Path $driveRoot -Recurse -Filter "PyMOLWin.exe" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) {
            Write-Host "  Found PyMOL at: $($found.FullName)" -ForegroundColor Green
            return $true
        }
    }

    return $false
}

function Ensure-Repository {
    param(
        [string]$ProjectDir,
        [string]$RepoUrl
    )

    Write-Host ""
    Write-Host "Preparing repository..."

    if (-not (Test-Path $ProjectDir)) {
        & git clone $RepoUrl $ProjectDir
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to clone the repository into $ProjectDir."
        }
        Write-Info "Repository cloned to $ProjectDir"
        return
    }

    if (Test-Path (Join-Path $ProjectDir ".git")) {
        & git -C $ProjectDir pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to update the repository in $ProjectDir."
        }
        Write-Info "Repository updated in $ProjectDir"
        return
    }

    throw "$ProjectDir already exists, but it is not a git repository. Move or remove it, then rerun the bootstrap."
}

function Run-ProjectInstaller {
    param([string]$ProjectDir)

    Write-Host ""
    Write-Host "Running project installer..."
    $installer = Join-Path $ProjectDir "install.bat"
    if (-not (Test-Path $installer)) {
        throw "install.bat was not found at $installer"
    }

    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$installer`"" -WorkingDirectory $ProjectDir -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        throw "install.bat failed with exit code $($proc.ExitCode)."
    }
}

Write-Host ""
Write-Host "==============================================="
Write-Host " PyMOL AI Assistant - Windows Bootstrap"
Write-Host "==============================================="
Write-Host ""

if ($env:OS -ne 'Windows_NT') {
    Write-Err "This bootstrap currently supports Windows only."
    exit 1
}

Write-Host "Checking network access..."
if (-not (Test-Network)) {
    Write-Err "Could not reach GitHub. Check your internet connection and try again."
    exit 1
}
Write-Info "Network access looks good"

$packageManager = Get-PackageManager
if (-not $packageManager) {
    Write-Err "No supported package manager was found."
    Write-Err "Install winget or Chocolatey, then rerun this bootstrap."
    Write-Err "Recommended: winget"
    exit 1
}
Write-Info "Package manager: $packageManager"

$projectDir = Join-Path $env:USERPROFILE "pymol_ai_assistant"
$repoUrl = "https://github.com/varunsharm16/pymol_ai_assistant.git"

try {
    Ensure-Git $packageManager
    Ensure-Python $packageManager
    Ensure-Node $packageManager

    Write-Host ""
    Write-Host "Checking PyMOL..."
    if (-not (Test-PyMOLInstalled)) {
        throw "PyMOL was not found in the common Windows install locations. Install PyMOL first, then rerun this bootstrap."
    }
    Write-Info "PyMOL installation detected"

    Ensure-Repository -ProjectDir $projectDir -RepoUrl $repoUrl
    Run-ProjectInstaller -ProjectDir $projectDir
} catch {
    Write-Err $_.Exception.Message
    exit 1
}

Write-Host ""
Write-Host "==============================================="
Write-Host " Bootstrap complete!"
Write-Host "==============================================="
Write-Host ""
Write-Host "  1. Open PyMOL"
Write-Host "  2. Type: ai"
Write-Host "  3. The Electron UI should launch"
Write-Host ""
