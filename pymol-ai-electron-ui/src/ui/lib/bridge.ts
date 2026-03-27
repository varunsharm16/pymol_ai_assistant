let _baseUrl: string | null = null;
const MAX_RETRIES = 5;

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
      getNodeVersion: () => Promise<string>;
      getPythonVersion: () => Promise<string>;
    };
  }
}

// ---------------------------------------------------------------------------
// Base URL discovery
// ---------------------------------------------------------------------------

async function getBaseUrl(): Promise<string> {
  if (_baseUrl) return _baseUrl;

  // Try to get port from Electron IPC
  if (window.api?.getBackendPort) {
    const port = await window.api.getBackendPort();
    if (port) {
      _baseUrl = `http://127.0.0.1:${port}`;
      return _baseUrl;
    }
  }

  // Fallback for development
  _baseUrl = 'http://127.0.0.1:5179';
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
    return { ok: false, error: e?.message || 'Backend unreachable' };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    body: JSON.stringify({ pdb_id: pdbId }),
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
  const res = await apiFetch<{
    ok: boolean;
    pdb_id: string;
    title: string;
    method: string;
    resolution: number | null;
  }>(`/pdb-info/${encodeURIComponent(pdbId.trim().toUpperCase())}`);
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
