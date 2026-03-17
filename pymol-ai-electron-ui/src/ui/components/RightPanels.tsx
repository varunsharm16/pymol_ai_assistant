import React from 'react';
import { useStore } from '../store';
import { Button } from './Button';
import { Copy, Save, FolderOpen, Plus } from 'lucide-react';
import SettingsPanel from './SettingsPanel';
import HealthCheckPanel from './HealthCheckPanel';
import MoleculePanel from './MoleculePanel';
import { saveProject, getRecentProjects } from '../lib/bridge';
import ConfirmDialog from './ConfirmDialog';
import {
  createBlankProjectFlow,
  deleteProjectFlow,
  isTerminalProjectActionError,
  openProjectFlow,
  switchProjectFlow,
} from '../lib/projectSync';

export const RightPanels: React.FC = () => {
  const panel = useStore((s) => s.ui.rightPanel);
  const notes = useStore((s) => s.notes[s.currentProjectId] || '');
  const setNotes = useStore((s) => s.setNotes);

  return (
    <div
      className={`transition-all duration-300 ${
        panel === 'none'
          ? 'w-0'
          : 'w-[280px] sm:w-[320px] md:w-[360px] lg:w-[380px]'
      } overflow-hidden`}
    >
      {panel === 'projects' && <ProjectsPanel />}
      {panel === 'notepad' && <NotePadPanel notes={notes} onChange={setNotes} />}
      {panel === 'toolbox' && <ToolBoxPanel />}
      {panel === 'help' && <HelpPanel />}
      {panel === 'settings' && <SettingsPanel />}
      {panel === 'healthcheck' && <HealthCheckPanel />}
      {panel === 'molecules' && <MoleculePanel />}
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 py-3 text-sm uppercase tracking-wide text-neutral-300 bg-neutral-900">
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Projects Panel                                                    */
/* ------------------------------------------------------------------ */
const ProjectsPanel: React.FC = () => {
  const projects = useStore((s) => s.projects);
  const current = useStore((s) => s.currentProjectId);
  const renameProject = useStore((s) => s.renameProject);
  const pendingRenameId = useStore((s) => s.pendingRenameId);
  const setPendingRename = useStore((s) => s.setPendingRename);
  const logs = useStore((s) => s.logs);
  const addLog = useStore((s) => s.addLog);
  const projectMolecules = useStore((s) => s.projectMolecules);
  const recentProjects = useStore((s) => s.recentProjects);
  const setRecentProjects = useStore((s) => s.setRecentProjects);
  const switchingProject = useStore((s) => s.switchingProject);

  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (pendingRenameId) {
      setRenameId(pendingRenameId);
      setMenuId(null);
      setTimeout(() => inputRef.current?.focus(), 0);
      setPendingRename(null);
    }
  }, [pendingRenameId, setPendingRename]);

  React.useEffect(() => {
    getRecentProjects().then(setRecentProjects).catch(() => {});
  }, []);

  const onRename = (id: string) => {
    setRenameId(id);
    setMenuId(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitRename = (id: string, name: string) => {
    renameProject(id, name.trim() || 'Untitled');
    setRenameId(null);
  };

  const onSave = async () => {
    if (!window.api?.showSaveDialog) return;
    const proj = projects.find((p) => p.id === current);
    const currentMolecule = projectMolecules[current] || {};
    const res = await window.api.showSaveDialog({
      title: 'Save Project',
      defaultPath: `${proj?.name || 'project'}.pymolai`,
      filters: [{ name: 'PyMOL AI Project', extensions: ['pymolai'] }],
    });
    if (!res || res.canceled || !res.filePath) return;

    setSaving(true);
    const projectLogs = logs[current] || [];
    const result = await saveProject({
      path: res.filePath,
      name: proj?.name || 'Untitled',
      commands: projectLogs.map((l) => ({ prompt: l.prompt, ts: l.ts, status: l.status })),
      pdb_id: currentMolecule.pdbId,
      molecule_path: currentMolecule.filePath,
    });
    setSaving(false);

    if (result.ok) {
      addLog({ prompt: 'Save project', status: 'success', message: `Saved to ${result.path}` });
      getRecentProjects().then(setRecentProjects).catch(() => {});
    } else {
      addLog({ prompt: 'Save project', status: 'error', message: ('error' in result && result.error) || 'Failed' });
    }
  };

  const onOpen = async (path?: string) => {
    let filePath = path;
    if (!filePath) {
      if (!window.api?.showOpenDialog) return;
      const res = await window.api.showOpenDialog({
        title: 'Open Project',
        filters: [{ name: 'PyMOL AI Project', extensions: ['pymolai'] }],
        properties: ['openFile'],
      });
      if (!res || res.canceled || !res.filePaths?.length) return;
      filePath = res.filePaths[0];
    }
    const result = await openProjectFlow(filePath!);
    if (result.ok && result.metadata) {
      addLog({ prompt: 'Load project', status: 'success', message: `Loaded: ${result.metadata.name}` });
    } else if (isTerminalProjectActionError('error' in result ? result.error : undefined)) {
      addLog({ prompt: 'Load project', status: 'error', message: ('error' in result && result.error) || 'Failed' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <SectionTitle>Projects</SectionTitle>

      {/* Save / Open buttons */}
      <div className="flex gap-2 px-3 py-2">
        <button
          onClick={() => {
            createBlankProjectFlow('New Project').then((result) => {
              if (!result.ok && isTerminalProjectActionError('error' in result ? result.error : undefined)) {
                addLog({
                  prompt: 'Create project',
                  status: 'error',
                  message: ('error' in result && result.error) || 'Failed to create project',
                });
              }
            });
          }}
          disabled={switchingProject}
          className="h-8 rounded-full bg-neutral-700 hover:bg-neutral-600 px-3 text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> New
        </button>
        <button
          onClick={onSave}
          disabled={saving || switchingProject}
          className="flex-1 h-8 rounded-full bg-brand hover:bg-brandHover text-black text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => onOpen()}
          disabled={switchingProject}
          className="flex-1 h-8 rounded-full bg-neutral-700 hover:bg-neutral-600 text-sm flex items-center justify-center gap-1.5"
        >
          <FolderOpen className="w-3.5 h-3.5" /> Open
        </button>
      </div>

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <div className="px-3 pb-2">
          <div className="text-[11px] uppercase text-neutral-500 mb-1">Recent</div>
          {recentProjects.slice(0, 5).map((r) => (
            <button
              key={r.path}
              onClick={() => onOpen(r.path)}
              className="w-full text-left text-sm px-2 py-1 rounded-lg hover:bg-neutral-900/60 truncate text-neutral-300"
              title={r.path}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <div className="h-px bg-neutral-700 mx-3" />

      {/* Project list */}
      <div className="p-2 flex-1 overflow-auto">
        {projects.map((p) => (
          <div
            key={p.id}
            onMouseEnter={() => setHoverId(p.id)}
            onMouseLeave={() => {
              if (menuId !== p.id) setHoverId(null);
            }}
            className={`relative flex items-center justify-between px-3 py-2 rounded-3xl cursor-default
              ${p.id === current ? 'bg-neutral-900' : 'hover:bg-neutral-900/60'} ${
                switchingProject ? 'opacity-60' : ''
              }`}
            onClick={() => {
              if (renameId === p.id || switchingProject) return;
              switchProjectFlow(p.id).then((result) => {
                if (!result.ok && isTerminalProjectActionError('error' in result ? result.error : undefined)) {
                  addLog({
                    prompt: 'Switch project',
                    status: 'error',
                    message: ('error' in result && result.error) || 'Failed to switch project',
                  });
                }
              });
            }}
          >
            <div className="truncate pr-2">
              {renameId === p.id ? (
                <input
                  ref={inputRef}
                  defaultValue={p.name}
                  onBlur={(e) => commitRename(p.id, e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    commitRename(p.id, (e.target as HTMLInputElement).value)
                  }
                  className="w-full bg-[#171717] rounded px-2 py-1 outline-none"
                />
              ) : (
                <span title={p.name}>{p.name}</span>
              )}
            </div>

            {(hoverId === p.id || menuId === p.id) && (
              <div className="relative app-no-drag">
                <Button
                  variant="ghost"
                  className="px-2"
                  onClick={() => setMenuId(menuId === p.id ? null : p.id)}
                >
                  ⋮
                </Button>
                {menuId === p.id && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl bg-[#2A2A2A] border border-neutral-700 shadow-xl z-10">
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-[#1F1F1F]"
                      onClick={() => onRename(p.id)}
                    >
                      Rename…
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-[#1F1F1F] text-[#C65536]"
                      onClick={() => {
                        setMenuId(null);
                        setDeleteId(p.id);
                      }}
                    >
                      Delete…
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete project?"
        body="This removes the selected project and its local logs, notes, molecule badge, and in-memory session snapshot."
        confirmLabel="Delete Project"
        destructive
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (!id) return;
          deleteProjectFlow(id).then((result) => {
            if (!result.ok && isTerminalProjectActionError('error' in result ? result.error : undefined)) {
              addLog({
                prompt: 'Delete project',
                status: 'error',
                message: ('error' in result && result.error) || 'Failed to delete project',
              });
            }
          });
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Note Pad Panel                                                    */
/* ------------------------------------------------------------------ */
const NotePadPanel: React.FC<{
  notes: string;
  onChange: (v: string) => void;
}> = ({ notes, onChange }) => {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <SectionTitle>Note Pad</SectionTitle>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 m-3 rounded-2xl bg-neutral-900 p-3 outline-none"
        placeholder="Write markdown or plain text..."
      />
      <div className="p-3">
        <button
          type="button"
          onClick={onCopy}
          className="w-full h-11 rounded-full bg-brand hover:bg-brandHover text-black font-medium flex items-center justify-center gap-2 app-no-drag"
          title="Copy notes"
          aria-label="Copy notes"
        >
          <Copy className="w-4 h-4" strokeWidth={2.25} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Tool Box Panel                                                    */
/* ------------------------------------------------------------------ */
const ToolBoxPanel: React.FC = () => {
  const setDraft = useStore((s) => s.setDraft);
  const [open, setOpen] = React.useState<string | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);

  const functions = [
    {
      key: 'color_residue',
      label: 'Color Residue',
      desc: 'Color a residue, optionally by chain.',
      examples: ['Color ALA in chain B green', 'Color CYS yellow'],
    },
    {
      key: 'color_chain',
      label: 'Color Chain',
      desc: 'Color an entire chain.',
      examples: ['Color chain A red', 'Color all chains white'],
    },
    {
      key: 'color_all',
      label: 'Color All',
      desc: 'Color everything.',
      examples: ['Color all green'],
    },
    {
      key: 'set_background',
      label: 'Set Background',
      desc: 'Set background color.',
      examples: ['Set bg to black', 'Background white'],
    },
    {
      key: 'rotate_view',
      label: 'Rotate View',
      desc: 'Rotate camera around an axis.',
      examples: ['Rotate 90 around X', 'Rotate 30 around Z'],
    },
    {
      key: 'snapshot',
      label: 'Snapshot',
      desc: 'Save a PNG snapshot.',
      examples: ['Snapshot as figure.png'],
    },
  ];

  const select = (id: string) => setOpen(id === open ? null : id);
  const apply = (t: string) => setDraft(t);

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <div className="px-4 py-3 text-sm uppercase tracking-wide text-neutral-300 bg-neutral-900">
        Tool Box
      </div>

      <div className="p-2 space-y-2 overflow-auto">
        {functions.map((f) => {
          const isHover = hoverId === f.key;
          const isOpen = open === f.key;
          return (
            <div
              key={f.key}
              onMouseEnter={() => setHoverId(f.key)}
              onMouseLeave={() => setHoverId(null)}
              className={`rounded-3xl px-3 py-2 cursor-pointer transition
                ${isOpen ? 'bg-[#171717]' : isHover ? 'bg-[#1F1F1F]' : ''}`}
              onClick={() => select(f.key)}
            >
              <div className="flex items-center justify-between">
                <div className="truncate font-medium">{f.label}</div>
                <div className="text-neutral-400">{isOpen ? '▴' : '▾'}</div>
              </div>

              {isOpen && (
                <div className="mt-2 rounded-2xl border border-brand p-3 bg-[#1F1F1F]">
                  <div className="mb-2 text-sm text-neutral-300">{f.desc}</div>
                  <ul className="list-disc ml-5 space-y-1">
                    {f.examples.map((ex) => (
                      <li
                        key={ex}
                        className="hover:text-brand cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          apply(ex);
                        }}
                      >
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Help Panel                                                        */
/* ------------------------------------------------------------------ */
const HelpPanel: React.FC = () => (
  <div className="h-full flex flex-col bg-[#2A2A2A]">
    <SectionTitle>Help</SectionTitle>
    <div className="p-4 space-y-2 text-sm">
      <a
        className="block px-3 py-2 rounded-xl hover:bg-[#1F1F1F]"
        href="https://github.com/varunsharm16/pymol_ai_assistant"
        target="_blank"
        rel="noreferrer"
      >
        GitHub Repository
      </a>
      <a
        className="block px-3 py-2 rounded-xl hover:bg-[#1F1F1F]"
        href="https://github.com/varunsharm16/pymol_ai_assistant/issues"
        target="_blank"
        rel="noreferrer"
      >
        Report an Issue
      </a>
    </div>
  </div>
);
