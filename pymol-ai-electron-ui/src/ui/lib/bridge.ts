const BASE = 'http://127.0.0.1:5179';
const MAX_RETRIES = 5;

export type CurrentSelectionTag = {
  label: string;
  description: string;
  count: number;
  source: string;
  target: Record<string, any>;
};

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

function describeBridgeFailure(path: string, res: BridgeResult<any>) {
  const raw = res.error || 'Bridge request failed.';

  if (res.status === 504 || /timeout/i.test(raw)) {
    if (path === '/session/capture') {
      return 'Session capture stalled in PyMOL. It may still finish, but this project action could not confirm it.';
    }
    return 'PyMOL did not acknowledge this request in time. It may still be running in PyMOL.';
  }

  if (res.status === 503) {
    return 'No PyMOL plugin connected.';
  }

  if (res.status === 404) {
    return raw;
  }

  if (res.status === 500) {
    return raw || 'PyMOL reported an execution error.';
  }

  return raw;
}

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
      getNodeVersion: () => Promise<string>;
      getPythonVersion: () => Promise<string>;
    };
  }
}

async function apiFetch<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<BridgeResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
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
    return { ok: false, error: e?.message || 'Bridge unreachable' };
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
          ? 'Sending to bridge…'
          : `Retrying bridge request (attempt ${attempt}/${MAX_RETRIES})…`,
    });

    const res = await apiFetch<T>(path, opts);
    if (res.ok) {
      onProgress?.({
        phase: 'success',
        attempt,
        message: 'PyMOL acknowledged the request.',
      });
      return res;
    }

    if (!isRetryable(res) || attempt === MAX_RETRIES) {
      const message = describeBridgeFailure(path, res);
      onProgress?.({
        phase: 'error',
        attempt,
        message,
      });
      return { ...res, error: message };
    }

    const backoff = Math.min(1000 * Math.pow(2, attempt), 16000);
    onProgress?.({
      phase: 'waiting',
      attempt,
      message: `${res.error || 'Bridge unavailable'} Retrying in ${Math.round(
        backoff / 1000
      )}s…`,
    });
    await delay(backoff);
    attempt += 1;
  }

  return { ok: false, error: 'Max retries exceeded' };
}

export async function sendCommand(
  spec: any,
  onProgress?: (update: BridgeProgress) => void
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const res = await requestWithRetry('/command', {
    method: 'POST',
    body: JSON.stringify(spec),
  }, onProgress);
  return { ok: res.ok, error: res.error, status: res.status };
}

export async function sendNL(
  text: string,
  onProgress?: (update: BridgeProgress) => void
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const res = await requestWithRetry('/nl', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }, onProgress);
  return { ok: res.ok, error: res.error, status: res.status };
}

export async function snapshotWithPicker(
  defaultName?: string,
  onProgress?: (update: BridgeProgress) => void
): Promise<{ ok: boolean; error?: string; canceled?: boolean }> {
  if (!window.api?.showSaveDialog) {
    return { ok: false, error: 'Native dialog unavailable' };
  }
  const res = await window.api.showSaveDialog({
    title: 'Save Snapshot',
    defaultPath: defaultName?.trim() || 'snapshot.png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  });
  if (!res || res.canceled || !res.filePath) return { ok: false, canceled: true };

  let path = res.filePath;
  if (!path.toLowerCase().endsWith('.png')) path += '.png';
  return sendCommand({ name: 'snapshot', arguments: { filename: path } }, onProgress);
}

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

export async function checkHealth(): Promise<{
  ok: boolean;
  version?: string;
  pluginConnected?: boolean;
  error?: string;
}> {
  const res = await apiFetch<{
    status: string;
    version: string;
    plugin_connected: boolean;
  }>('/health');
  if (res.ok && res.data) {
    return {
      ok: true,
      version: res.data.version,
      pluginConnected: res.data.plugin_connected,
    };
  }
  return { ok: false, error: res.error };
}

export async function getCurrentSelection(): Promise<{
  ok: boolean;
  selection?: CurrentSelectionTag | null;
  error?: string;
}> {
  const res = await apiFetch<{ ok: boolean; selection: CurrentSelectionTag | null }>('/selection/current');
  if (res.ok) {
    return { ok: true, selection: res.data?.selection ?? null };
  }
  return { ok: false, error: res.error };
}

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

export async function fetchPdb(
  pdbId: string,
  onProgress?: (update: BridgeProgress) => void
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const res = await requestWithRetry('/fetch-pdb', {
    method: 'POST',
    body: JSON.stringify({ pdb_id: pdbId }),
  }, onProgress);
  return { ok: res.ok, error: res.error, status: res.status };
}

export async function importFile(
  filePath: string,
  onProgress?: (update: BridgeProgress) => void
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const res = await requestWithRetry('/import-file', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  }, onProgress);
  return { ok: res.ok, error: res.error, status: res.status };
}

export async function captureSession(): Promise<{
  ok: boolean;
  data?: string;
  error?: string;
}> {
  const res = await apiFetch<{ ok: boolean; data: string }>('/session/capture', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return {
    ok: res.ok,
    data: res.data?.data,
    error: res.ok ? undefined : describeBridgeFailure('/session/capture', res),
  };
}

export async function restoreSession(data: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/session/restore', {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
  return {
    ok: res.ok,
    error: res.ok ? undefined : describeBridgeFailure('/session/restore', res),
  };
}

export async function clearSession(): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/session/clear', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return {
    ok: res.ok,
    error: res.ok ? undefined : describeBridgeFailure('/session/clear', res),
  };
}

export async function saveProject(opts: {
  path: string;
  name: string;
  commands: any[];
  pdb_id?: string;
  molecule_path?: string;
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  const res = await apiFetch<{ ok: boolean; path: string }>('/project/save', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
  if (res.ok && res.data) return { ok: true, path: res.data.path };
  return { ok: false, error: res.error };
}

export async function loadProject(
  path: string
): Promise<{ ok: boolean; metadata?: any; sessionData?: string; error?: string }> {
  const res = await apiFetch<{ ok: boolean; metadata: any; session_data: string }>(
    '/project/load',
    {
      method: 'POST',
      body: JSON.stringify({ path }),
    }
  );
  if (res.ok && res.data) {
    return {
      ok: true,
      metadata: res.data.metadata,
      sessionData: res.data.session_data,
    };
  }
  return { ok: false, error: res.error };
}

export async function getRecentProjects(): Promise<
  Array<{ name: string; path: string; saved_at: string }>
> {
  const res = await apiFetch<{
    ok: boolean;
    projects: Array<{ name: string; path: string; saved_at: string }>;
  }>('/projects/recent');
  return res.data?.projects ?? [];
}

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
