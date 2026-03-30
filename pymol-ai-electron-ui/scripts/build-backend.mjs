import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(__dirname, '..');
const repoRoot = resolve(uiRoot, '..');
const bridgeRoot = resolve(repoRoot, 'pymol-bridge');
const buildRoot = resolve(uiRoot, 'build');
const entrypoint = join(bridgeRoot, 'main.py');
const hostPlatform = process.platform;
const hostArch = process.arch;
const targetPlatform = process.env.NEXMOL_TARGET_PLATFORM || hostPlatform;
const targetArch = process.env.NEXMOL_TARGET_ARCH || hostArch;
const targetKey = `${targetPlatform}-${targetArch}`;
const configRoot = join(buildRoot, 'backend-config', targetKey);
const distRoot = join(buildRoot, 'backend-dist', targetKey);
const workRoot = join(buildRoot, 'backend-work', targetKey);
const specRoot = join(buildRoot, 'backend-spec', targetKey);

function fail(message) {
  console.error(`[NexMol] ${message}`);
  process.exit(1);
}

if (targetPlatform !== hostPlatform) {
  if (targetPlatform === 'win32') {
    fail(
      [
        `Windows backend packaging must run on Windows.`,
        `Requested target: ${targetPlatform}/${targetArch}`,
        `Current host: ${hostPlatform}/${hostArch}`,
      ].join('\n')
    );
  }

  fail(
    [
      `Cross-platform backend packaging is not supported by this script.`,
      `Requested target: ${targetPlatform}/${targetArch}`,
      `Current host: ${hostPlatform}/${hostArch}`,
    ].join('\n')
  );
}

const pythonCmd = hostPlatform === 'win32'
  ? join(bridgeRoot, '.venv', 'Scripts', 'python.exe')
  : join(bridgeRoot, '.venv', 'bin', 'python');

if (!existsSync(pythonCmd)) {
  console.error(
    [
      '[NexMol] Backend packaging requires the pymol-bridge virtualenv.',
      `Expected Python at: ${pythonCmd}`,
      'Create it with:',
      '  cd pymol-bridge',
      hostPlatform === 'win32'
        ? '  py -m venv .venv && .venv\\Scripts\\python -m pip install -r requirements.txt && .venv\\Scripts\\python -m pip install -r requirements-build.txt'
        : '  python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt && .venv/bin/python -m pip install -r requirements-build.txt',
    ].join('\n')
  );
  process.exit(1);
}

const versionCheck = spawnSync(pythonCmd, ['-m', 'PyInstaller', '--version'], {
  cwd: bridgeRoot,
  encoding: 'utf-8',
});

if (versionCheck.status !== 0) {
  console.error(
    [
      '[NexMol] PyInstaller is not installed in pymol-bridge/.venv.',
      'Install it with:',
      hostPlatform === 'win32'
        ? '  pymol-bridge\\.venv\\Scripts\\python -m pip install -r pymol-bridge\\requirements-build.txt'
        : '  pymol-bridge/.venv/bin/python -m pip install -r pymol-bridge/requirements-build.txt',
    ].join('\n')
  );
  process.exit(versionCheck.status ?? 1);
}

const supportedArchs = new Set(['x64', 'arm64']);
if (!supportedArchs.has(targetArch)) {
  fail(
    [
      `Unsupported target arch: ${targetArch}`,
      `Supported values: x64, arm64`,
    ].join('\n')
  );
}

let pyInstallerTargetArch = null;
if (targetPlatform === 'darwin') {
  pyInstallerTargetArch = targetArch === 'x64' ? 'x86_64' : 'arm64';
} else if (targetPlatform === 'win32' && targetArch !== hostArch) {
  fail(
    [
      `Windows backend packaging must match the host architecture.`,
      `Requested target arch: ${targetArch}`,
      `Current host arch: ${hostArch}`,
    ].join('\n')
  );
}

rmSync(distRoot, { recursive: true, force: true });
rmSync(workRoot, { recursive: true, force: true });
rmSync(specRoot, { recursive: true, force: true });
rmSync(configRoot, { recursive: true, force: true });

const args = [
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onedir',
  '--name', 'nexmol-backend',
  '--distpath', distRoot,
  '--workpath', workRoot,
  '--specpath', specRoot,
  '--paths', bridgeRoot,
  '--hidden-import', 'command_model',
  '--hidden-import', 'uvicorn.logging',
  '--hidden-import', 'uvicorn.loops.auto',
  '--hidden-import', 'uvicorn.protocols.http.auto',
  '--hidden-import', 'uvicorn.protocols.websockets.auto',
  '--hidden-import', 'uvicorn.lifespan.on',
  '--collect-all', 'fastapi',
  '--collect-all', 'starlette',
  '--collect-all', 'anyio',
  '--collect-all', 'uvicorn',
  '--collect-all', 'httpx',
  '--collect-all', 'openai',
  '--collect-all', 'certifi',
  entrypoint,
];

if (pyInstallerTargetArch) {
  args.splice(7, 0, '--target-arch', pyInstallerTargetArch);
}

const result = spawnSync(pythonCmd, args, {
  cwd: bridgeRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYINSTALLER_CONFIG_DIR: configRoot,
  },
});

process.exit(result.status ?? 1);
