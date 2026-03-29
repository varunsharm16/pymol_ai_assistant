let _baseUrl: string | null = null;
const MAX_RETRIES = 5;
const DEV_PORT_FILE = 'nexmol-backend-port.json';

export type BridgeProgress = {
  phase: 'sending' | 'retrying' | 'waiting' | 'success' | 'error';
  attempt: number;
  message: string;
};

type BridgeResult<T = any> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
};

declare global {
  interface Window {
    api?: {
      showSaveDialog: (opts: {
        title?: string;
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        properties?: string[];
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      showOpenDialog: (opts: {
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        properties?: string[];
      }) => Promise<{ canceled: boolean; filePaths?: string[] }>;
      writeFile: (opts: { path: string; dataBase64: string }) => Promise<{ ok: boolean }>;
      getBackendPort: () => Promise<number | null>;
      getBackendStartupError: () => Promise<string | null>;
      isPackagedApp: () => Promise<boolean>;
      getAppVersion: () => Promise<string>;
      getNodeVersion: () => Promise<string>;
      getPythonVersion: () => Promise<string>;
    };
  }
}

// ---------------------------------------------------------------------------
// Base URL discovery
// ---------------------------------------------------------------------------

async function getBrowserPublishedPort(): Promise<number | null> {
  try {
    const url = new URL(`./${DEV_PORT_FILE}`, window.location.href);
    url.searchParams.set('ts', String(Date.now()));

    const res = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const body = await res.json().catch(() => null) as { port?: unknown } | null;
    const port = Number(body?.port);
    if (!Number.isInteger(port) || port <= 0) return null;
    return port;
  } catch {
    return null;
  }
}

async function getBaseUrl(): Promise<string> {
  if (_baseUrl) return _baseUrl;

  // Try to get port from Electron IPC
  if (window.api?.getBackendPort) {
    const port = await window.api.getBackendPort();
    if (port) {
      _baseUrl = `http://127.0.0.1:${port}`;
      return _baseUrl;
    }
    const startupError = await window.api.getBackendStartupError?.();
    throw new Error(startupError || 'Backend port not ready yet');
  }

  // Allow ?port= query param override for dev-in-browser
  const params = new URLSearchParams(window.location.search);
  const overridePort = params.get('port');
  if (overridePort) {
    _baseUrl = `http://127.0.0.1:${overridePort}`;
    return _baseUrl;
  }

  const browserPort = await getBrowserPublishedPort();
  if (browserPort) {
    _baseUrl = `http://127.0.0.1:${browserPort}`;
    return _baseUrl;
  }

  // Final fallback: not in Electron, and no published port file was found.
  console.warn(
    '[NexMol] No Electron IPC or published backend port was found.\n' +
    'If running in browser, start the backend manually on port 8000 or add ?port=XXXXX to the URL.'
  );
  _baseUrl = 'http://127.0.0.1:8000';
  return _baseUrl;
}

// ---------------------------------------------------------------------------
// Core fetch helpers
// ---------------------------------------------------------------------------

async function apiFetch<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<BridgeResult<T>> {
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: body?.error || body?.detail || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    return { ok: true, data: body as T, status: res.status };
  } catch (e: any) {
    _baseUrl = null;
    return { ok: false, error: e?.message || 'Backend unreachable', status: 503 };
  }
}

function post<T = any>(path: string, body: any): Promise<BridgeResult<T>> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function get<T = any>(path: string): Promise<BridgeResult<T>> {
  return apiFetch<T>(path, { method: 'GET' });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isPackagedApp(): Promise<boolean> {
  try {
    return await window.api?.isPackagedApp?.() || false;
  } catch {
    return false;
  }
}

export async function getAppVersion(): Promise<string> {
  try {
    return (await window.api?.getAppVersion?.()) || '0.2.1-alpha';
  } catch {
    return '0.2.1-alpha';
  }
}

function isRetryable(res: BridgeResult<any>) {
  return res.status === undefined || res.status === 503;
}

async function requestWithRetry<T = any>(
  path: string,
  opts: RequestInit,
  onProgress?: (update: BridgeProgress) => void
): Promise<BridgeResult<T>> {
  let attempt = 1;

  while (attempt <= MAX_RETRIES) {
    onProgress?.({
      phase: attempt === 1 ? 'sending' : 'retrying',
      attempt,
      message:
        attempt === 1
          ? 'Sending request…'
          : `Retrying (attempt ${attempt}/${MAX_RETRIES})…`,
    });

    const res = await apiFetch<T>(path, opts);
    if (res.ok) {
      onProgress?.({
        phase: 'success',
        attempt,
        message: 'Request completed.',
      });
      return res;
    }

    if (!isRetryable(res) || attempt === MAX_RETRIES) {
      const message = res.error || 'Request failed.';
      onProgress?.({ phase: 'error', attempt, message });
      return { ...res, error: message };
    }

    const backoff = Math.min(1000 * Math.pow(2, attempt), 16000);
    onProgress?.({
      phase: 'waiting',
      attempt,
      message: `${res.error || 'Backend unavailable'} Retrying in ${Math.round(backoff / 1000)}s…`,
    });
    await delay(backoff);
    attempt += 1;
  }

  return { ok: false, error: 'Max retries exceeded' };
}

// ---------------------------------------------------------------------------
// Natural Language → Command Spec
// ---------------------------------------------------------------------------

export async function sendNL(
  text: string,
  onProgress?: (update: BridgeProgress) => void
): Promise<{ ok: boolean; spec?: any; error?: string }> {
  const res = await requestWithRetry<{ ok: boolean; spec: any }>('/nl', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }, onProgress);

  if (res.ok && res.data?.spec) {
    return { ok: true, spec: res.data.spec };
  }
  return { ok: false, error: res.error || (res.data as any)?.error };
}

// ---------------------------------------------------------------------------
// Structure data
// ---------------------------------------------------------------------------

export async function fetchStructureData(
  pdbId: string,
  onProgress?: (update: BridgeProgress) => void
): Promise<{ ok: boolean; data?: string; format?: string; pdb_id?: string; error?: string }> {
  const res = await requestWithRetry<{
    ok: boolean;
    data: string;
    format: string;
    pdb_id: string;
  }>('/structures/fetch-data', {
    method: 'POST',
    body: JSON.stringify({ pdb_id: pdbId, format: 'mmcif' }),
  }, onProgress);

  if (res.ok && res.data) {
    return { ok: true, data: res.data.data, format: res.data.format, pdb_id: res.data.pdb_id };
  }
  return { ok: false, error: res.error };
}

export async function readStructureFile(
  filePath: string,
  onProgress?: (update: BridgeProgress) => void
): Promise<{ ok: boolean; data?: string; format?: string; name?: string; error?: string }> {
  const res = await requestWithRetry<{
    ok: boolean;
    data: string;
    format: string;
    name: string;
  }>('/structures/read-file', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  }, onProgress);

  if (res.ok && res.data) {
    return { ok: true, data: res.data.data, format: res.data.format, name: res.data.name };
  }
  return { ok: false, error: res.error };
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

export async function checkApiKey(): Promise<boolean> {
  const res = await apiFetch<{ configured: boolean }>('/api-key');
  if (!res.ok && isRetryable(res)) {
    throw new Error(res.error || 'Backend unavailable');
  }
  return res.data?.configured ?? false;
}

export async function saveApiKey(
  key: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/api-key', {
    method: 'POST',
    body: JSON.stringify({ key }),
  });
  return { ok: res.ok, error: res.error };
}

export async function validateApiKey(
  key?: string
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const res = await apiFetch<{ ok: boolean; message?: string; error?: string }>(
    '/validate-key',
    {
      method: 'POST',
      body: JSON.stringify({ key: key || '' }),
    }
  );
  if (res.ok) return { ok: true, message: res.data?.message };
  return { ok: false, error: res.error || res.data?.error };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function checkHealth(): Promise<{
  ok: boolean;
  version?: string;
  error?: string;
}> {
  const res = await apiFetch<{
    status: string;
    version: string;
    uptime_seconds: number;
  }>('/health');
  if (res.ok && res.data) {
    return { ok: true, version: res.data.version };
  }
  return { ok: false, error: res.error };
}

// ---------------------------------------------------------------------------
// PDB Info (metadata lookup)
// ---------------------------------------------------------------------------

export async function getPdbInfo(pdbId: string): Promise<{
  ok: boolean;
  pdb_id?: string;
  title?: string;
  method?: string;
  resolution?: number | null;
  error?: string;
}> {
  const res = await requestWithRetry<{
    ok: boolean;
    pdb_id: string;
    title: string;
    method: string;
    resolution: number | null;
  }>(`/pdb-info/${encodeURIComponent(pdbId.trim().toUpperCase())}`, {
    method: 'GET',
  });
  if (res.ok && res.data) return res.data;
  return { ok: false, error: res.error };
}

// ---------------------------------------------------------------------------
// File operations (Electron native)
// ---------------------------------------------------------------------------

export async function writeFile(
  path: string,
  bytes: Uint8Array
): Promise<{ ok: boolean; error?: string }> {
  if (!window.api?.writeFile) {
    return { ok: false, error: 'Native file writer unavailable' };
  }

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const dataBase64 = btoa(binary);

  try {
    await window.api.writeFile({ path, dataBase64 });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'File write failed' };
  }
}

// ---------------------------------------------------------------------------
// Project Save / Load
// ---------------------------------------------------------------------------

export async function saveProject(opts: {
  path: string;
  name: string;
  commands: any[];
  notes?: string;
  pdb_id?: string;
  molecule_path?: string;
  structure_data?: string;
  structure_format?: string;
  object_name?: string;
  viewer_state?: any;
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  const res = await post('/projects/save', opts);
  if (res.ok && res.data) return res.data;
  return { ok: false, error: res.error || 'Save failed' };
}

export async function loadProject(
  path: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const res = await post('/projects/load', { path });
  if (res.ok && res.data) return res.data;
  return { ok: false, error: res.error || 'Load failed' };
}

export async function getRecentProjects(): Promise<
  Array<{ name: string; path: string; saved_at: string }>
> {
  const res = await get('/projects/recent');
  if (res.ok && res.data?.projects) return res.data.projects;
  return [];
}
