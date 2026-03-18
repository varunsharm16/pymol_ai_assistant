import { captureSession, clearSession, loadProject, restoreSession } from './bridge';
import { useStore } from '../store';

const captureJobs = new Map<string, Promise<{ ok: true } | { ok: false; error: string }>>();

function currentProject() {
  const state = useStore.getState();
  return state.projects.find((project) => project.id === state.currentProjectId) || null;
}

function projectNeedsCapture(projectId: string) {
  const state = useStore.getState();
  const notes = (state.notes[projectId] || '').trim();
  const logs = state.logs[projectId] || [];
  const molecule = state.projectMolecules[projectId] || {};
  const hasSession = Boolean(state.projectSessions[projectId]);
  const hasMolecule = Boolean(molecule.pdbId || molecule.filePath || molecule.name);

  // A brand-new blank project should not trigger a session capture.
  if (!hasSession && !hasMolecule && !notes && logs.length === 0) {
    return false;
  }

  return !hasSession || Boolean(state.projectSessionDirty[projectId]);
}

async function captureProjectSession(projectId: string) {
  const existing = captureJobs.get(projectId);
  if (existing) return existing;

  const job = (async () => {
    const state = useStore.getState();
    const res = await captureSession();
    if (!res.ok) {
      return { ok: false as const, error: res.error || 'Failed to capture current session.' };
    }
    state.setProjectSession(projectId, res.data || null);
    return { ok: true as const };
  })();

  captureJobs.set(projectId, job);
  try {
    return await job;
  } finally {
    captureJobs.delete(projectId);
  }
}

async function snapshotCurrentProject(force = false) {
  const state = useStore.getState();
  const sourceId = state.currentProjectId;
  if (!force && !projectNeedsCapture(sourceId)) {
    return { ok: true as const };
  }

  const res = await captureProjectSession(sourceId);
  if (!res.ok) {
    return { ok: false as const, error: res.error || 'Failed to capture current session.' };
  }
  return { ok: true as const };
}

export function markCurrentProjectSessionDirty() {
  useStore.getState().setCurrentProjectSessionDirty(true);
}

export async function refreshCurrentProjectSessionCache() {
  const state = useStore.getState();
  const projectId = state.currentProjectId;
  if (!projectNeedsCapture(projectId)) {
    return { ok: true as const };
  }
  return captureProjectSession(projectId);
}

export function isTerminalProjectActionError(error?: string) {
  const message = (error || '').toLowerCase();
  if (!message) return true;
  return !(
    message.includes('may still be running in pymol') ||
    message.includes('stalled in pymol') ||
    message.includes('may still finish')
  );
}

export async function startFreshWorkspaceFlow(name = 'New Project') {
  const state = useStore.getState();
  state.resetWorkspace(name);
  const cleared = await clearSession();
  if (!cleared.ok && cleared.error !== 'No PyMOL plugin connected') {
    return { ok: false as const, error: cleared.error || 'Failed to clear PyMOL workspace.' };
  }
  return { ok: true as const };
}

async function activateProject(projectId: string) {
  const state = useStore.getState();
  const session = state.projectSessions[projectId];
  const result = session
    ? await restoreSession(session)
    : await clearSession();

  if (!result.ok) {
    return { ok: false as const, error: result.error || 'Failed to activate project.' };
  }

  state.selectProject(projectId);
  state.setProjectSessionDirty(projectId, false);
  return { ok: true as const };
}

export async function createBlankProjectFlow(name = 'New Project') {
  const state = useStore.getState();
  state.setSwitchingProject(true);
  try {
    const snap = await snapshotCurrentProject();
    if (!snap.ok) return snap;

    const projectId = state.createProject(name);
    const cleared = await clearSession();
    if (!cleared.ok) {
      state.deleteProject(projectId);
      return { ok: false as const, error: cleared.error || 'Failed to clear PyMOL workspace.' };
    }

    state.selectProject(projectId);
    state.setProjectSession(projectId, null);
    state.setProjectMolecule(projectId, {});
    return { ok: true as const, projectId };
  } finally {
    useStore.getState().setSwitchingProject(false);
  }
}

export async function switchProjectFlow(targetId: string) {
  const state = useStore.getState();
  if (state.switchingProject || state.currentProjectId === targetId) {
    return { ok: true as const };
  }

  state.setSwitchingProject(true);
  try {
    const snap = await snapshotCurrentProject();
    if (!snap.ok) return snap;
    return activateProject(targetId);
  } finally {
    useStore.getState().setSwitchingProject(false);
  }
}

export async function deleteProjectFlow(projectId: string) {
  const state = useStore.getState();
  const projects = state.projects;
  const isCurrent = state.currentProjectId === projectId;

  if (!isCurrent) {
    state.deleteProject(projectId);
    return { ok: true as const };
  }

  const remaining = projects.filter((project) => project.id !== projectId);
  let fallbackId: string | null = remaining[0]?.id || null;

  if (!fallbackId) {
    fallbackId = state.createProject('New Project');
    state.setProjectSession(fallbackId, null);
    state.setProjectMolecule(fallbackId, {});
  }

  state.setSwitchingProject(true);
  try {
    const switchResult = await activateProject(fallbackId);
    if (!switchResult.ok) {
      if (remaining.length === 0) {
        state.deleteProject(fallbackId);
      }
      return switchResult;
    }

    state.deleteProject(projectId);
    return { ok: true as const, projectId: fallbackId };
  } finally {
    useStore.getState().setSwitchingProject(false);
  }
}

export async function openProjectFlow(path: string) {
  const state = useStore.getState();
  const current = currentProject();

  state.setSwitchingProject(true);
  try {
    const snap = await snapshotCurrentProject();
    if (!snap.ok) return snap;

    const loaded = await loadProject(path);
    if (!loaded.ok || !loaded.metadata) {
      return { ok: false as const, error: loaded.error || 'Failed to load project.' };
    }

    const projectId = state.hydrateProjectFromLoadedFile({
      name: loaded.metadata.name || 'Loaded Project',
      logs: Array.isArray(loaded.metadata.commands) ? loaded.metadata.commands : [],
      notes: loaded.metadata.notes || '',
      molecule: {
        pdbId: loaded.metadata.pdb_id || undefined,
        filePath: loaded.metadata.molecule_path || undefined,
        name: loaded.metadata.pdb_id || loaded.metadata.molecule_path || loaded.metadata.name,
      },
      sessionData: loaded.sessionData || null,
    });

    const activated = await activateProject(projectId);
    if (!activated.ok) {
      state.deleteProject(projectId);
      if (current) {
        await activateProject(current.id);
      }
      return activated;
    }

    return { ok: true as const, projectId, metadata: loaded.metadata };
  } finally {
    useStore.getState().setSwitchingProject(false);
  }
}
