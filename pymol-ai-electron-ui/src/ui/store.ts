import { create } from 'zustand';

export type LogEntry = {
  id: string;
  ts: number;
  prompt: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  resolver?: 'parser' | 'llm';
  normalizedSpec?: {
    name: string;
    arguments?: Record<string, any>;
  };
  diagnostic?: string;
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

export type ViewerSelectionSpec =
  | { kind: 'all' }
  | { kind: 'protein' }
  | { kind: 'ligand' }
  | { kind: 'water' }
  | { kind: 'metals' }
  | { kind: 'hydrogens' }
  | { kind: 'active_selection' }
  | { kind: 'current_selection' }
  | { kind: 'selection_set'; items: ViewerSelectionSpec[] }
  | { kind: 'chain'; chain: string; object?: string }
  | { kind: 'residue'; residue: string; chain?: string; resi?: string; atom?: string; object?: string; allMatches?: boolean }
  | { kind: 'atom'; atom: string; residue?: string; chain?: string; resi?: string; object?: string }
  | { kind: 'object'; object: string };

export type SequenceUiMode = 'single' | 'polymers' | 'all';
export const DEFAULT_SEQUENCE_PANEL_WIDTH = 420;

export type ProjectStructure = {
  data: string;
  format: string;
  objectName?: string;
};

export type NormalizedSpec = {
  name: string;
  arguments?: Record<string, any>;
};

export type ViewerState = {
  backgroundColor?: string;
  cameraSnapshot?: any;
  operations: NormalizedSpec[];
  sequenceUi?: { open: boolean; mode: SequenceUiMode; width: number };
};

type Right =
  | 'none'
  | 'chat'
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
  projectStructures: Record<string, ProjectStructure | undefined>;
  projectViewerStates: Record<string, ViewerState | undefined>;
  draft: string;
  ui: { rightPanel: Right };
  currentViewerSelection: ViewerSelectionSpec | null;
  activeViewerSelections: ViewerSelectionSpec[];
  selectedResiduePair: ViewerSelectionSpec[];
  sequenceUi: { open: boolean; mode: SequenceUiMode; width: number };
  viewerReady: boolean;
  viewerExpanded: boolean;

  apiKeyConfigured: boolean;
  showApiKeyModal: boolean;
  healthChecks: HealthCheck[];
  recentProjects: RecentProject[];

  pendingRenameId?: string | null;
  switchingProject: boolean;

  forceRightPanel: (p: Right) => void;
  setRightPanel: (p: Right) => void;
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
  setCurrentViewerSelection: (selection: ViewerSelectionSpec | null) => void;
  setActiveViewerSelections: (selections: ViewerSelectionSpec[]) => void;
  setSelectedResiduePair: (pair: ViewerSelectionSpec[]) => void;
  clearViewerSelectionState: () => void;
  setSequenceUiOpen: (open: boolean) => void;
  toggleSequenceUi: () => void;
  setSequenceUiMode: (mode: SequenceUiMode) => void;
  setSequenceUiWidth: (width: number) => void;
  setViewerReady: (ready: boolean) => void;
  setViewerExpanded: (expanded: boolean) => void;
  setPendingRename: (id: string | null) => void;
  selectProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  setApiKeyConfigured: (v: boolean) => void;
  setShowApiKeyModal: (v: boolean) => void;
  setHealthChecks: (checks: HealthCheck[]) => void;
  setRecentProjects: (p: RecentProject[]) => void;
  setProjectMolecule: (projectId: string, molecule: MoleculeInfo) => void;
  setCurrentProjectMolecule: (molecule: MoleculeInfo) => void;
  setProjectStructure: (projectId: string, structure?: ProjectStructure) => void;
  setCurrentProjectStructure: (structure?: ProjectStructure) => void;
  setProjectViewerState: (projectId: string, viewerState?: ViewerState) => void;
  setCurrentProjectViewerState: (viewerState?: ViewerState) => void;
  hydrateProjectFromLoadedFile: (opts: {
    id?: string;
    name: string;
    logs?: Array<Partial<LogEntry>>;
    notes?: string;
    molecule?: MoleculeInfo;
    structure?: ProjectStructure;
    viewerState?: ViewerState;
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
    projectStructures: { [project.id]: undefined as ProjectStructure | undefined },
    projectViewerStates: {
      [project.id]: { operations: [], sequenceUi: { open: false, mode: 'single', width: DEFAULT_SEQUENCE_PANEL_WIDTH } } as ViewerState,
    },
  };
}

const initialWorkspace = createWorkspaceState();

export const useStore = create<State>((set, get) => ({
  currentProjectId: initialWorkspace.currentProjectId,
  projects: initialWorkspace.projects,
  logs: initialWorkspace.logs,
  notes: initialWorkspace.notes,
  projectMolecules: initialWorkspace.projectMolecules,
  projectStructures: initialWorkspace.projectStructures,
  projectViewerStates: initialWorkspace.projectViewerStates,
  draft: '',
  ui: { rightPanel: 'none' },
  currentViewerSelection: null,
  activeViewerSelections: [],
  selectedResiduePair: [],
  sequenceUi: { open: false, mode: 'single', width: DEFAULT_SEQUENCE_PANEL_WIDTH },
  viewerReady: false,
  viewerExpanded: false,

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
      currentProjectId: p.id,
      projects: [p, ...s.projects],
      logs: { ...s.logs, [p.id]: [] },
      notes: { ...s.notes, [p.id]: '' },
      projectMolecules: { ...s.projectMolecules, [p.id]: {} },
      projectStructures: { ...s.projectStructures, [p.id]: undefined },
      projectViewerStates: {
        ...s.projectViewerStates,
        [p.id]: { operations: [], sequenceUi: { open: false, mode: 'single', width: DEFAULT_SEQUENCE_PANEL_WIDTH } },
      },
      pendingRenameId: p.id,
    }));
    return p.id;
  },
  deleteProject: (id) =>
    set((s) => {
      const remainingProjects = s.projects.filter((p) => p.id !== id);
      const fallbackProject = remainingProjects[0] || createProjectRecord('New Project');
      const logs = Object.fromEntries(Object.entries(s.logs).filter(([key]) => key !== id));
      const notes = Object.fromEntries(Object.entries(s.notes).filter(([key]) => key !== id));
      const projectMolecules = Object.fromEntries(
        Object.entries(s.projectMolecules).filter(([key]) => key !== id)
      );
      const projectStructures = Object.fromEntries(
        Object.entries(s.projectStructures).filter(([key]) => key !== id)
      );
      const projectViewerStates = Object.fromEntries(
        Object.entries(s.projectViewerStates).filter(([key]) => key !== id)
      );

      if (!remainingProjects.length) {
        logs[fallbackProject.id] = [];
        notes[fallbackProject.id] = '';
        projectMolecules[fallbackProject.id] = {};
        projectStructures[fallbackProject.id] = undefined;
        projectViewerStates[fallbackProject.id] = { operations: [], sequenceUi: { open: false, mode: 'single', width: DEFAULT_SEQUENCE_PANEL_WIDTH } };
      }

      return {
        currentProjectId:
          s.currentProjectId === id ? fallbackProject.id : s.currentProjectId,
        projects: remainingProjects.length ? remainingProjects : [fallbackProject],
        logs,
        notes,
        projectMolecules,
        projectStructures,
        projectViewerStates,
      };
    }),
  addLog: (entry) => get().addLogToProject(get().currentProjectId, entry),
  addLogToProject: (projectId, entry) => {
    const id = uid();
    const logEntry = { id, ts: Date.now(), ...entry };
    set((s) => ({
      logs: {
        ...s.logs,
        [projectId]: [...(s.logs[projectId] || []), logEntry],
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
  setCurrentViewerSelection: (selection) => set({ currentViewerSelection: selection }),
  setActiveViewerSelections: (selections) => set({ activeViewerSelections: selections }),
  setSelectedResiduePair: (pair) => set({ selectedResiduePair: pair }),
  clearViewerSelectionState: () => set({ currentViewerSelection: null, activeViewerSelections: [], selectedResiduePair: [] }),
  setSequenceUiOpen: (open) =>
    set((s) => {
      const currentViewerState = s.projectViewerStates[s.currentProjectId] || { operations: [] };
      return {
        sequenceUi: { ...s.sequenceUi, open },
        projectViewerStates: {
          ...s.projectViewerStates,
          [s.currentProjectId]: {
            ...currentViewerState,
            sequenceUi: { ...(currentViewerState.sequenceUi || s.sequenceUi), open },
          },
        },
      };
    }),
  toggleSequenceUi: () =>
    set((s) => {
      const open = !s.sequenceUi.open;
      const currentViewerState = s.projectViewerStates[s.currentProjectId] || { operations: [] };
      return {
        sequenceUi: { ...s.sequenceUi, open },
        projectViewerStates: {
          ...s.projectViewerStates,
          [s.currentProjectId]: {
            ...currentViewerState,
            sequenceUi: { ...(currentViewerState.sequenceUi || s.sequenceUi), open },
          },
        },
      };
    }),
  setSequenceUiMode: (mode) =>
    set((s) => {
      const currentViewerState = s.projectViewerStates[s.currentProjectId] || { operations: [] };
      return {
        sequenceUi: { ...s.sequenceUi, mode },
        projectViewerStates: {
          ...s.projectViewerStates,
          [s.currentProjectId]: {
            ...currentViewerState,
            sequenceUi: { ...(currentViewerState.sequenceUi || s.sequenceUi), mode },
          },
        },
      };
    }),
  setSequenceUiWidth: (width) =>
    set((s) => {
      const currentViewerState = s.projectViewerStates[s.currentProjectId] || { operations: [] };
      return {
        sequenceUi: { ...s.sequenceUi, width },
        projectViewerStates: {
          ...s.projectViewerStates,
          [s.currentProjectId]: {
            ...currentViewerState,
            sequenceUi: { ...(currentViewerState.sequenceUi || s.sequenceUi), width },
          },
        },
      };
    }),
  setViewerReady: (ready) => set({ viewerReady: ready }),
  setViewerExpanded: (expanded) => set({ viewerExpanded: expanded }),

  setApiKeyConfigured: (v) => set({ apiKeyConfigured: v }),
  setShowApiKeyModal: (v) => set({ showApiKeyModal: v }),
  setHealthChecks: (checks) => set({ healthChecks: checks }),
  setRecentProjects: (p) => set({ recentProjects: p }),
  setProjectMolecule: (projectId, molecule) =>
    set((s) => ({
      projectMolecules: { ...s.projectMolecules, [projectId]: molecule },
    })),
  setCurrentProjectMolecule: (molecule) => {
    const projectId = get().currentProjectId;
    get().setProjectMolecule(projectId, molecule);
  },
  setProjectStructure: (projectId, structure) =>
    set((s) => ({
      projectStructures: { ...s.projectStructures, [projectId]: structure },
    })),
  setCurrentProjectStructure: (structure) => {
    const projectId = get().currentProjectId;
    get().setProjectStructure(projectId, structure);
  },
  setProjectViewerState: (projectId, viewerState) =>
    set((s) => ({
      projectViewerStates: { ...s.projectViewerStates, [projectId]: viewerState },
    })),
  setCurrentProjectViewerState: (viewerState) => {
    const projectId = get().currentProjectId;
    get().setProjectViewerState(projectId, viewerState);
  },
  hydrateProjectFromLoadedFile: ({ id, name, logs, notes, molecule, structure, viewerState }) => {
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
      projectStructures: { ...s.projectStructures, [projectId]: structure },
      projectViewerStates: {
        ...s.projectViewerStates,
        [projectId]: viewerState || { operations: [], sequenceUi: { open: false, mode: 'single', width: DEFAULT_SEQUENCE_PANEL_WIDTH } },
      },
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
      projectStructures: workspace.projectStructures,
      projectViewerStates: workspace.projectViewerStates,
      pendingRenameId: null,
      switchingProject: false,
      draft: '',
      ui: { rightPanel: 'none' },
      currentViewerSelection: null,
      activeViewerSelections: [],
      selectedResiduePair: [],
      sequenceUi: { ...s.sequenceUi, open: false },
      viewerReady: false,
    }));
    return workspace.currentProjectId;
  },
}));
