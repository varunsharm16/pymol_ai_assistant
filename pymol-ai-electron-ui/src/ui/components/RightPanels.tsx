import React from 'react';
import { useStore } from '../store';
import { Button } from './Button';
import { Copy, Plus, Save, FolderOpen } from 'lucide-react';
import SettingsPanel from './SettingsPanel';
import HealthCheckPanel from './HealthCheckPanel';
import MoleculePanel from './MoleculePanel';
import { saveProject, loadProject, getRecentProjects, fetchStructureData, readStructureFile } from '../lib/bridge';
import ConfirmDialog from './ConfirmDialog';

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
  const projectStructures = useStore((s) => s.projectStructures);
  const projectViewerStates = useStore((s) => s.projectViewerStates);
  const selectProject = useStore((s) => s.selectProject);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const hydrateProject = useStore((s) => s.hydrateProjectFromLoadedFile);
  const notes = useStore((s) => s.notes);

  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [recentProjects, setRecentProjects] = React.useState<Array<{ name: string; path: string; saved_at: string }>>([]);
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
    const currentStructure = projectStructures[current];
    const currentViewerState = projectViewerStates[current];
    const res = await window.api.showSaveDialog({
      title: 'Save Project',
      defaultPath: `${proj?.name || 'project'}.nexmol`,
      filters: [{ name: 'NexMol Project', extensions: ['nexmol'] }],
    });
    if (!res || res.canceled || !res.filePath) return;

    setSaving(true);
    const projectLogs = logs[current] || [];
    const result = await saveProject({
      path: res.filePath,
      name: proj?.name || 'Untitled',
      commands: projectLogs.map((l) => ({
        prompt: l.prompt,
        ts: l.ts,
        status: l.status,
        resolver: l.resolver,
        normalized_spec: l.normalizedSpec,
        diagnostic: l.diagnostic,
      })),
      notes: notes[current] || '',
      pdb_id: currentMolecule.pdbId,
      molecule_path: currentMolecule.filePath,
      structure_data: currentStructure?.data,
      structure_format: currentStructure?.format,
      object_name: currentStructure?.objectName,
      viewer_state: currentViewerState,
    });
    setSaving(false);

    if (result.ok) {
      addLog({ prompt: 'Save project', status: 'success', message: `Saved to ${result.path}` });
      getRecentProjects().then(setRecentProjects).catch(() => {});
    } else {
      addLog({ prompt: 'Save project', status: 'error', message: result.error || 'Failed' });
    }
  };

  const onOpen = async (path?: string) => {
    let filePath = path;
    if (!filePath) {
      if (!window.api?.showOpenDialog) return;
      const res = await window.api.showOpenDialog({
        title: 'Open Project',
        filters: [{ name: 'NexMol Project', extensions: ['nexmol'] }],
        properties: ['openFile'],
      });
      if (!res || res.canceled || !res.filePaths?.length) return;
      filePath = res.filePaths[0];
    }

    const result = await loadProject(filePath!);
    if (result.ok && result.data) {
      const d = result.data;
      let structure = d.structure_data && d.structure_format
        ? {
            data: d.structure_data,
            format: d.structure_format,
            objectName: d.object_name || d.pdb_id || d.name,
          }
        : undefined;

      if (!structure && d.molecule_path) {
        const fileResult = await readStructureFile(d.molecule_path);
        if (fileResult.ok && fileResult.data) {
          structure = {
            data: fileResult.data,
            format: fileResult.format || 'pdb',
            objectName: d.object_name || d.name || fileResult.name,
          };
        }
      }

      if (!structure && d.pdb_id) {
        const fetchResult = await fetchStructureData(d.pdb_id);
        if (fetchResult.ok && fetchResult.data) {
          structure = {
            data: fetchResult.data,
            format: fetchResult.format || 'pdb',
            objectName: d.object_name || d.pdb_id,
          };
        }
      }

      const projectId = hydrateProject({
        name: d.name || 'Loaded Project',
        logs: (d.commands || []).map((c: any) => ({
          prompt: c.prompt,
          ts: c.ts,
          status: c.status || 'success',
          message: '',
          resolver: c.resolver,
          normalizedSpec: c.normalized_spec,
          diagnostic: c.diagnostic,
        })),
        notes: d.notes,
        molecule: { pdbId: d.pdb_id, filePath: d.molecule_path },
        structure,
        viewerState: d.viewer_state,
      });
      selectProject(projectId);
      addLog({
        prompt: 'Open project',
        status: structure || (!d.pdb_id && !d.molecule_path) ? 'success' : 'error',
        message: structure
          ? `Loaded: ${d.name}`
          : `Loaded metadata for ${d.name}, but the structure could not be restored.`,
      });
      getRecentProjects().then(setRecentProjects).catch(() => {});
    } else {
      addLog({ prompt: 'Open project', status: 'error', message: result.error || 'Failed' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <SectionTitle>Projects</SectionTitle>

      {/* Save / Open buttons */}
      <div className="flex gap-2 px-3 py-2">
        <button
          onClick={() => createProject('New Project')}
          className="h-8 rounded-full bg-neutral-700 hover:bg-neutral-600 px-3 text-sm flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> New
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 h-8 rounded-full bg-brand hover:bg-brandHover text-black text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => onOpen()}
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
              ${p.id === current ? 'bg-neutral-900' : 'hover:bg-neutral-900/60'}`}
            onClick={() => {
              if (renameId === p.id) return;
              selectProject(p.id);
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
        body="This removes the selected project and its local logs, notes, and molecule info."
        confirmLabel="Delete Project"
        destructive
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (!id) return;
          deleteProject(id);
          addLog({ prompt: 'Delete project', status: 'success', message: 'Project deleted.' });
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

  const sections = [
    {
      title: 'Selection & Cleanup',
      functions: [
        {
          key: 'remove_selection',
          label: 'Remove Selection',
          desc: 'Delete common disposable targets like waters, metals, or hydrogens.',
          examples: ['Remove waters', 'Remove metals', 'Remove hydrogens'],
        },
        {
          key: 'isolate_selection',
          label: 'Isolate Target',
          desc: 'Hide everything except the chosen target.',
          examples: ['Isolate ligand', 'Hide everything except ligand'],
        },
      ],
    },
    {
      title: 'Visual Styles',
      functions: [
        {
          key: 'show_representation',
          label: 'Show Representation',
          desc: 'Display a target with a chosen representation.',
          examples: ['Show ligand as sticks', 'Show protein as cartoon', 'Show surface representation of the protein'],
        },
        {
          key: 'color_selection',
          label: 'Color Selection',
          desc: 'Color a residue, chain, ligand, protein, or all atoms.',
          examples: ['Color ALA in chain B green', 'Color chain A red', 'Color protein grey'],
        },
        {
          key: 'color_by_chain',
          label: 'Color By Chain',
          desc: 'Apply chain-aware colors to the target.',
          examples: ['Color protein by chain', 'Color all by chain'],
        },
        {
          key: 'color_by_element',
          label: 'Color By Element',
          desc: 'Apply element-based coloring to the target.',
          examples: ['Color ligand by element', 'Color selection by element'],
        },
        {
          key: 'set_transparency',
          label: 'Set Transparency',
          desc: 'Change representation-specific transparency.',
          examples: ['Set surface transparency to 0.4 on protein', 'Set sticks transparency to 0.25 on ligand'],
        },
        {
          key: 'label_selection',
          label: 'Label Selection',
          desc: 'Label residues or atoms within a target.',
          examples: ['Label residues in chain A', 'Label ligand'],
        },
      ],
    },
    {
      title: 'Focus & Navigation',
      functions: [
        {
          key: 'zoom_selection',
          label: 'Zoom Target',
          desc: 'Center the camera on a target.',
          examples: ['Zoom to ligand', 'Center on chain A'],
        },
        {
          key: 'orient_selection',
          label: 'Orient Target',
          desc: 'Reorient the scene around a target.',
          examples: ['Orient on chain B', 'Orient on ligand'],
        },
        {
          key: 'rotate_view',
          label: 'Rotate View',
          desc: 'Rotate camera around an axis.',
          examples: ['Rotate 90 around X', 'Rotate 30 around Z'],
        },
      ],
    },
    {
      title: 'Analysis',
      functions: [
        {
          key: 'measure_distance',
          label: 'Measure Distance',
          desc: 'Create a distance object between two targets.',
          examples: ['Measure distance between ligand and residue ASP in chain B'],
        },
        {
          key: 'show_contacts',
          label: 'Show Polar Contacts (Staged)',
          desc: 'Planned NexMol feature. Prompt support is preserved, but execution still needs backend contact calculation.',
          examples: ['Show polar contacts between ligand and residue ASP in chain B'],
        },
        {
          key: 'align_objects',
          label: 'Align Objects (Staged)',
          desc: 'Planned NexMol feature. Prompt support is preserved, but execution still needs backend alignment support.',
          examples: ['Align object ligand_pose to object receptor'],
        },
        {
          key: 'snapshot',
          label: 'Snapshot',
          desc: 'Save a PNG snapshot.',
          examples: ['Snapshot as figure.png'],
        },
      ],
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
        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            <div className="px-2 pt-2 text-[11px] uppercase tracking-wide text-neutral-500">
              {section.title}
            </div>
            {section.functions.map((f) => {
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
        ))}
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
    <div className="p-4 space-y-3 text-sm">
      <div className="rounded-xl bg-neutral-900 p-3 text-neutral-300">
        One action per prompt. Supported targets include protein, ligand, water, metals, hydrogens,
        chain, residue, and all atoms.
      </div>
      <div className="rounded-xl bg-neutral-900 p-3 text-neutral-300">
        Supported representations: cartoon, sticks, surface, spheres, lines, mesh, and dots.
      </div>
      <div className="rounded-xl bg-neutral-900 p-3 text-neutral-300">
        Load a structure using the Molecules panel, then use short single-action prompts like
        &nbsp;&quot;show ligand as sticks&quot; or &quot;color chain A red&quot;.
      </div>
      <div className="rounded-xl bg-neutral-900 p-3 text-neutral-300">
        Staged commands such as contacts, alignment, and sequence view are preserved but may report
        that they are not implemented yet.
      </div>
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
