import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectDir, 'package.json');
const releaseDir = path.join(projectDir, 'release');
const appPath = path.join(releaseDir, 'mac-arm64', 'NexMol.app');
const statePath = path.join(releaseDir, 'mac-notarization.json');

const mode = process.argv[2] ?? 'submit';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, { cwd = projectDir, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(`${command} exited with code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      reject(error);
    });
  });
}

function parseJsonOrThrow(raw, context) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const trimmed = raw.trim();
    throw new Error(
      `${context} returned non-JSON output:\n${trimmed || '(empty output)'}`
    );
  }
}

async function readPackageVersion() {
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(raw).version;
}

async function writeState(state) {
  await fs.mkdir(releaseDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

async function readState() {
  const raw = await fs.readFile(statePath, 'utf8');
  return JSON.parse(raw);
}

async function submitForNotarization({ appleId, password, teamId }) {
  if (!(await exists(appPath))) {
    throw new Error(`Signed app not found: ${appPath}`);
  }

  const version = await readPackageVersion();
  const zipPath = path.join(releaseDir, `NexMol-${version}-arm64-notary.zip`);

  if (await exists(zipPath)) {
    await fs.rm(zipPath);
  }

  console.log(`Creating notarization archive: ${zipPath}`);
  await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath]);

  console.log('Submitting app to Apple notarization service...');
  const { stdout } = await run('xcrun', [
    'notarytool',
    'submit',
    zipPath,
    '--apple-id',
    appleId,
    '--password',
    password,
    '--team-id',
    teamId,
    '--output-format',
    'json',
  ]);

  const submission = parseJsonOrThrow(stdout, 'notarytool submit');
  const state = {
    createdAt: new Date().toISOString(),
    submissionId: submission.id,
    status: submission.status ?? 'Submitted',
    appPath,
    zipPath,
  };

  await writeState(state);
  console.log(`Saved notarization state to ${statePath}`);
  console.log(`Submission ID: ${submission.id}`);

  return state;
}

async function fetchNotarizationInfo(submissionId, { appleId, password, teamId }) {
  const { stdout } = await run('xcrun', [
    'notarytool',
    'info',
    submissionId,
    '--apple-id',
    appleId,
    '--password',
    password,
    '--team-id',
    teamId,
    '--output-format',
    'json',
  ]);

  return parseJsonOrThrow(stdout, 'notarytool info');
}

async function fetchNotarizationLog(submissionId, { appleId, password, teamId }) {
  const { stdout } = await run('xcrun', [
    'notarytool',
    'log',
    submissionId,
    '--apple-id',
    appleId,
    '--password',
    password,
    '--team-id',
    teamId,
    '--output-format',
    'json',
  ]);

  return parseJsonOrThrow(stdout, 'notarytool log');
}

async function stapleApp(targetAppPath) {
  console.log(`Stapling notarization ticket to ${targetAppPath}`);
  await run('xcrun', ['stapler', 'staple', targetAppPath]);
}

async function waitForAcceptance(state, credentials) {
  for (;;) {
    const info = await fetchNotarizationInfo(state.submissionId, credentials);
    state.status = info.status;
    state.lastCheckedAt = new Date().toISOString();
    await writeState(state);

    console.log(
      `[${state.lastCheckedAt}] Apple notarization status: ${info.status}`
    );

    if (info.status === 'Accepted') {
      await stapleApp(state.appPath);
      state.stapledAt = new Date().toISOString();
      await writeState(state);
      console.log('Notarization accepted and app stapled.');
      return;
    }

    if (info.status === 'Invalid' || info.status === 'Rejected') {
      const log = await fetchNotarizationLog(state.submissionId, credentials);
      const logPath = path.join(releaseDir, 'mac-notarization-log.json');
      await fs.writeFile(logPath, JSON.stringify(log, null, 2));
      throw new Error(
        `Apple notarization ${info.status.toLowerCase()}. Detailed log saved to ${logPath}`
      );
    }

    await sleep(30000);
  }
}

async function main() {
  const credentials = {
    appleId: requireEnv('APPLE_ID'),
    password: requireEnv('APPLE_APP_SPECIFIC_PASSWORD'),
    teamId: requireEnv('APPLE_TEAM_ID'),
  };

  let state;

  if (mode === 'submit') {
    state = await submitForNotarization(credentials);
  } else if (mode === 'resume') {
    if (!(await exists(statePath))) {
      throw new Error(`No notarization state file found at ${statePath}`);
    }

    state = await readState();
    console.log(`Resuming notarization for submission ${state.submissionId}`);
  } else {
    throw new Error(`Unsupported mode "${mode}". Use "submit" or "resume".`);
  }

  await waitForAcceptance(state, credentials);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
