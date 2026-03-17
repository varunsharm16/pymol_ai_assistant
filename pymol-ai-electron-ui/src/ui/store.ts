import { create } from 'zustand';

export type LogEntry = {
  id: string;
  ts: number;
  prompt: string;
  status: 'pending' | 'success' | 'error';
  message: string;
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type RecentProject = {
  name: string;
  path: string;
  saved_at: string;
};

export type HealthCheck = {
  label: string;
  status: 'pass' | 'fail' | 'pending' | 'idle';
  message: string;
  fix?: string;
};

export type MoleculeInfo = {
  pdbId?: string;
  filePath?: string;
  name?: string;
};

type Right =
  | 'none'
  | 'projects'
  | 'notepad'
  | 'toolbox'
  | 'help'
  | 'settings'
  | 'healthcheck'
  | 'molecules';

type State = {
  currentProjectId: string;
  projects: Project[];
  logs: Record<string, LogEntry[]>;
  notes: Record<string, string>;
  projectMolecules: Record<string, MoleculeInfo>;
  projectSessions: Record<string, string | null>;
  draft: string;
  ui: { rightPanel: Right; quickActionsExpanded: boolean };

  apiKeyConfigured: boolean;
  showApiKeyModal: boolean;
  healthChecks: HealthCheck[];
  recentProjects: RecentProject[];

  pendingRenameId?: string | null;
  switchingProject: boolean;

  forceRightPanel: (p: Right) => void;
  setRightPanel: (p: Right) => void;
  toggleQuickActions: () => void;
  setProjectName: (name: string) => void;
  createProject: (name: string) => string;
  deleteProject: (id: string) => void;
  addLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => string;
  addLogToProject: (projectId: string, entry: Omit<LogEntry, 'id' | 'ts'>) => string;
  updateLog: (logId: string, updates: Partial<LogEntry>) => void;
  updateLogEntry: (projectId: string, logId: string, updates: Partial<LogEntry>) => void;
  clearProjectLogs: (projectId: string) => void;
  setNotes: (md: string) => void;
  setDraft: (v: string) => void;
  setPendingRename: (id: string | null) => void;
  selectProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  setApiKeyConfigured: (v: boolean) => void;
  setShowApiKeyModal: (v: boolean) => void;
  setHealthChecks: (checks: HealthCheck[]) => void;
  setRecentProjects: (p: RecentProject[]) => void;
  setProjectSession: (projectId: string, data: string | null) => void;
  setProjectMolecule: (projectId: string, molecule: MoleculeInfo) => void;
  setCurrentProjectMolecule: (molecule: MoleculeInfo) => void;
  hydrateProjectFromLoadedFile: (opts: {
    id?: string;
    name: string;
    logs?: Array<Partial<LogEntry>>;
    notes?: string;
    molecule?: MoleculeInfo;
    sessionData?: string | null;
  }) => string;
  setSwitchingProject: (value: boolean) => void;
  resetWorkspace: (name?: string) => string;
};

const uid = () => Math.random().toString(36).slice(2);

function createProjectRecord(name = 'New Project'): Project {
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createWorkspaceState(name = 'New Project') {
  const project = createProjectRecord(name);
  return {
    project,
    currentProjectId: project.id,
    projects: [project],
    logs: { [project.id]: [] as LogEntry[] },
    notes: { [project.id]: '' },
    projectMolecules: { [project.id]: {} as MoleculeInfo },
    projectSessions: { [project.id]: null as string | null },
  };
}

const initialWorkspace = createWorkspaceState();

export const useStore = create<State>((set, get) => ({
  currentProjectId: initialWorkspace.currentProjectId,
  projects: initialWorkspace.projects,
  logs: initialWorkspace.logs,
  notes: initialWorkspace.notes,
  projectMolecules: initialWorkspace.projectMolecules,
  projectSessions: initialWorkspace.projectSessions,
  draft: '',
  ui: { rightPanel: 'none', quickActionsExpanded: false },

  apiKeyConfigured: false,
  showApiKeyModal: false,
  healthChecks: [],
  recentProjects: [],

  pendingRenameId: null,
  switchingProject: false,

  setPendingRename: (id) => set({ pendingRenameId: id }),
  selectProject: (id) => set({ currentProjectId: id }),
  renameProject: (id, name) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, name, updatedAt: Date.now() } : p
      ),
    })),

  setRightPanel: (p) =>
    set((s) => ({
      ui: { ...s.ui, rightPanel: s.ui.rightPanel === p ? 'none' : p },
    })),
  forceRightPanel: (p) =>
    set((s) => ({ ui: { ...s.ui, rightPanel: p } })),
  toggleQuickActions: () =>
    set((s) => ({
      ui: { ...s.ui, quickActionsExpanded: !s.ui.quickActionsExpanded },
    })),
  setProjectName: (name) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === s.currentProjectId
          ? { ...p, name, updatedAt: Date.now() }
          : p
      ),
    })),
  createProject: (name) => {
    const p = createProjectRecord(name);
    set((s) => ({
      projects: [p, ...s.projects],
      logs: { ...s.logs, [p.id]: [] },
      notes: { ...s.notes, [p.id]: '' },
      projectMolecules: { ...s.projectMolecules, [p.id]: {} },
      projectSessions: { ...s.projectSessions, [p.id]: null },
      pendingRenameId: p.id,
    }));
    return p.id;
  },
  deleteProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      logs: Object.fromEntries(Object.entries(s.logs).filter(([key]) => key !== id)),
      notes: Object.fromEntries(Object.entries(s.notes).filter(([key]) => key !== id)),
      projectMolecules: Object.fromEntries(
        Object.entries(s.projectMolecules).filter(([key]) => key !== id)
      ),
      projectSessions: Object.fromEntries(
        Object.entries(s.projectSessions).filter(([key]) => key !== id)
      ),
    })),
  addLog: (entry) => get().addLogToProject(get().currentProjectId, entry),
  addLogToProject: (projectId, entry) => {
    const id = uid();
    const logEntry = { id, ts: Date.now(), ...entry };
    set((s) => ({
      logs: {
        ...s.logs,
        [projectId]: [logEntry, ...(s.logs[projectId] || [])],
      },
    }));
    return id;
  },
  updateLog: (logId, updates) =>
    get().updateLogEntry(get().currentProjectId, logId, updates),
  updateLogEntry: (projectId, logId, updates) =>
    set((s) => ({
      logs: {
        ...s.logs,
        [projectId]: (s.logs[projectId] || []).map((entry) =>
          entry.id === logId ? { ...entry, ...updates } : entry
        ),
      },
    })),
  clearProjectLogs: (projectId) =>
    set((s) => ({
      logs: { ...s.logs, [projectId]: [] },
    })),
  setNotes: (md) =>
    set((s) => ({ notes: { ...s.notes, [s.currentProjectId]: md } })),
  setDraft: (v) => set({ draft: v }),

  setApiKeyConfigured: (v) => set({ apiKeyConfigured: v }),
  setShowApiKeyModal: (v) => set({ showApiKeyModal: v }),
  setHealthChecks: (checks) => set({ healthChecks: checks }),
  setRecentProjects: (p) => set({ recentProjects: p }),
  setProjectSession: (projectId, data) =>
    set((s) => ({
      projectSessions: { ...s.projectSessions, [projectId]: data },
    })),
  setProjectMolecule: (projectId, molecule) =>
    set((s) => ({
      projectMolecules: { ...s.projectMolecules, [projectId]: molecule },
    })),
  setCurrentProjectMolecule: (molecule) => {
    const projectId = get().currentProjectId;
    get().setProjectMolecule(projectId, molecule);
  },
  hydrateProjectFromLoadedFile: ({ id, name, logs, notes, molecule, sessionData }) => {
    const projectId = id || uid();
    const project: Project = {
      id: projectId,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      projects: [project, ...s.projects.filter((p) => p.id !== projectId)],
      logs: {
        ...s.logs,
        [projectId]: (logs || []).map((entry) => ({
          id: uid(),
          ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
          prompt: entry.prompt || '',
          status:
            entry.status === 'success' || entry.status === 'error' || entry.status === 'pending'
              ? entry.status
              : 'success',
          message: entry.message || '',
        })),
      },
      notes: { ...s.notes, [projectId]: notes || '' },
      projectMolecules: { ...s.projectMolecules, [projectId]: molecule || {} },
      projectSessions: { ...s.projectSessions, [projectId]: sessionData || null },
    }));
    return projectId;
  },
  setSwitchingProject: (value) => set({ switchingProject: value }),
  resetWorkspace: (name = 'New Project') => {
    const workspace = createWorkspaceState(name);
    set((s) => ({
      currentProjectId: workspace.currentProjectId,
      projects: workspace.projects,
      logs: workspace.logs,
      notes: workspace.notes,
      projectMolecules: workspace.projectMolecules,
      projectSessions: workspace.projectSessions,
      pendingRenameId: null,
      switchingProject: false,
      draft: '',
      ui: { ...s.ui, rightPanel: 'none' },
    }));
    return workspace.currentProjectId;
  },
}));
