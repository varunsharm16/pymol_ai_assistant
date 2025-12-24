import { create } from 'zustand';

export type LogEntry = { id: string; ts: number; prompt: string; status: 'success'|'error'; message: string };
export type Project = { id: string; name: string; createdAt: number; updatedAt: number };
type Right = 'none'|'projects'|'notepad'|'toolbox'|'help'|'profile'|'upgrade';

type Subscription = {
  plan: string;
  cycleStart: Date;
  cycleEnd: Date;
  promptsUsed: number;
  promptsLimit: number;
};

type State = {
  currentProjectId: string;
  projects: Project[];
  logs: Record<string, LogEntry[]>;
  notes: Record<string, string>;
  draft: string; // <— shared prompt draft
  ui: { rightPanel: Right; quickActionsExpanded: boolean };
  forceRightPanel: (p: Right)=>void;
  setRightPanel: (p: Right)=>void;
  toggleQuickActions: ()=>void;
  setProjectName: (name:string)=>void;
  createProject: (name:string)=>void;
  addLog: (e: Omit<LogEntry,'id'|'ts'>)=>void;
  setNotes: (md:string)=>void;
  setDraft: (v:string)=>void;
  pendingRenameId?: string | null;
  setPendingRename: (id: string | null)=>void;
  selectProject: (id: string)=>void;
  renameProject: (id: string, name: string)=>void;
  subscription: Subscription;
  setSubscription: (s: Partial<Subscription>)=>void;

};

const uid = () => Math.random().toString(36).slice(2);
const initialProject: Project = { id: uid(), name: 'New Project', createdAt: Date.now(), updatedAt: Date.now() };

export const useStore = create<State>((set, get) => ({
  currentProjectId: initialProject.id,
  projects: [initialProject],
  logs: { [initialProject.id]: [] },
  notes: { [initialProject.id]: '' },
  draft: '',
  ui: { rightPanel: 'none', quickActionsExpanded: false },
  subscription: {
    plan: 'PRO',
    cycleStart: new Date(),
    cycleEnd: new Date(Date.now() + 30 * 864e5),
    promptsUsed: 0,
    promptsLimit: 1000,
  },

  // rename/select helpers
  pendingRenameId: null,
  setPendingRename: (id) => set({ pendingRenameId: id }),
  selectProject: (id) => set({ currentProjectId: id }),
  renameProject: (id, name) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, name, updatedAt: Date.now() } : p
      ),
    })),

  // other actions
  setRightPanel: (p) =>
    set((s) => ({
      ui: { ...s.ui, rightPanel: s.ui.rightPanel === p ? 'none' : p },
    })),
  toggleQuickActions: () =>
    set((s) => ({ ui: { ...s.ui, quickActionsExpanded: !s.ui.quickActionsExpanded } })),
  setProjectName: (name) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === s.currentProjectId ? { ...p, name, updatedAt: Date.now() } : p
      ),
    })),
  createProject: (name) =>
    set((s) => {
      const p = { id: uid(), name, createdAt: Date.now(), updatedAt: Date.now() };
      return {
        projects: [p, ...s.projects],
        currentProjectId: p.id,
        logs: { ...s.logs, [p.id]: [] },
        notes: { ...s.notes, [p.id]: '' },
        pendingRenameId: p.id,
      };
    }),
  addLog: (e) =>
    set((s) => {
      const id = s.currentProjectId;
      const entry = { id: uid(), ts: Date.now(), ...e };
      return { logs: { ...s.logs, [id]: [entry, ...(s.logs[id] || [])] } };
    }),
  setNotes: (md) => set((s) => ({ notes: { ...s.notes, [s.currentProjectId]: md } })),
  setDraft: (v) => set({ draft: v }),
  forceRightPanel: (p) => set((s) => ({ ui: { ...s.ui, rightPanel: p } })),
  setSubscription: (s) =>
    set((st) => ({ subscription: { ...st.subscription, ...s } })),

}));

// 2) PERSISTENCE BLOCK — this goes AFTER the store is created
const STORAGE_KEY = 'pymol-ai-ui';

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    const sub = data.subscription ?? {};
    useStore.setState({
      currentProjectId: data.currentProjectId ?? initialProject.id,
      projects: Array.isArray(data.projects) ? data.projects : [initialProject],
      logs: data.logs ?? { [initialProject.id]: [] },
      notes: data.notes ?? { [initialProject.id]: '' },
      subscription: {
        plan: sub.plan ?? 'PRO',
        cycleStart: sub.cycleStart ? new Date(sub.cycleStart) : new Date(),
        cycleEnd: sub.cycleEnd ? new Date(sub.cycleEnd) : new Date(Date.now() + 30 * 864e5),
        promptsUsed: typeof sub.promptsUsed === 'number' ? sub.promptsUsed : 0,
        promptsLimit: typeof sub.promptsLimit === 'number' ? sub.promptsLimit : 1000,
      },
    });
  }
} catch {
  // ignore parse errors
}

useStore.subscribe((state) => {
  const toSave = {
    currentProjectId: state.currentProjectId,
    projects: state.projects,
    logs: state.logs,
    notes: state.notes,
    subscription: state.subscription
      ? {
          ...state.subscription,
          cycleStart:
            state.subscription.cycleStart instanceof Date
              ? state.subscription.cycleStart.toISOString()
              : (state.subscription.cycleStart as any),
          cycleEnd:
            state.subscription.cycleEnd instanceof Date
              ? state.subscription.cycleEnd.toISOString()
              : (state.subscription.cycleEnd as any),
        }
      : undefined,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
});
