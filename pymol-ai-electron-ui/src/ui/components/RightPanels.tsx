import React from 'react';
import { useStore } from '../store';
import { Button } from './Button';
import { Download } from 'lucide-react';
import ProfilePanel from '../components/ProfilePanel';

export const RightPanels: React.FC = () => {
  const panel = useStore(s => s.ui.rightPanel);
  const setPanel = useStore(s => s.setRightPanel);
  const notes = useStore(s => s.notes[s.currentProjectId] || '');
  const setNotes = useStore(s => s.setNotes);
  return (
    <div className={`transition-all duration-300 ${panel==='none'
      ? 'w-0'
      : 'w-[280px] sm:w-[320px] md:w-[360px] lg:w-[380px]'} overflow-hidden`}>

      {panel==='projects' && <ProjectsPanel />}
      {panel==='notepad' && <NotePadPanel notes={notes} onChange={setNotes} />}
      {panel==='toolbox' && <ToolBoxPanel />}
      {panel==='help' && <HelpPanel />}
      {panel==='profile' && <ProfilePanel />}
      {panel==='upgrade' && <UpgradePanel />}
    </div>
  );
};

const SectionTitle: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="px-4 py-3 text-sm uppercase tracking-wide text-neutral-300 bg-neutral-900">{children}</div>
);

const ProjectsPanel: React.FC = () => {
  const projects = useStore(s => s.projects);
  const current = useStore(s => s.currentProjectId);
  const selectProject = useStore(s => s.selectProject);
  const renameProject = useStore(s => s.renameProject);
  const pendingRenameId = useStore(s => s.pendingRenameId);
  const setPendingRename = useStore(s => s.setPendingRename);

  const [hoverId, setHoverId] = React.useState<string|null>(null);
  const [menuId, setMenuId] = React.useState<string|null>(null);
  const [renameId, setRenameId] = React.useState<string|null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(()=>{
    if (pendingRenameId) {
      setRenameId(pendingRenameId);
      setMenuId(null);
      setTimeout(()=> inputRef.current?.focus(), 0);
      setPendingRename(null);
    }
  }, [pendingRenameId, setPendingRename]);

  const onDelete = (id: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    alert('Delete logic will be wired later.');
  };
  const onExport = (id: string) => alert('Export complete (pdf/docx/md) — later.');
  const onRename = (id: string) => {
    setRenameId(id);
    setMenuId(null);
    setTimeout(()=> inputRef.current?.focus(), 0);
  };
  const commitRename = (id: string, name: string) => {
    const v = name.trim() || 'Untitled';
    renameProject(id, v);
    setRenameId(null);
  };

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <SectionTitle>Projects</SectionTitle>
      <div className="p-2 flex-1 overflow-auto">
        {projects.map(p => (
          <div
            key={p.id}
            onMouseEnter={()=>setHoverId(p.id)}
            onMouseLeave={()=>{ if(menuId!==p.id) setHoverId(null); }}
            className={`relative flex items-center justify-between px-3 py-2 rounded-3xl cursor-default
              ${p.id===current ? 'bg-neutral-900' : 'hover:bg-neutral-900/60'}`}
            onClick={()=> selectProject(p.id)}
          >
            <div className="truncate pr-2">
              {renameId===p.id ? (
                <input
                  ref={inputRef}
                  defaultValue={p.name}
                  onBlur={e=>commitRename(p.id, e.target.value)}
                  onKeyDown={e=> e.key==='Enter' && commitRename(p.id, (e.target as HTMLInputElement).value)}
                  className="w-full bg-[#171717] rounded px-2 py-1 outline-none"
                />
              ) : (
                <span title={p.name}>{p.name}</span>
              )}
            </div>

            {(hoverId===p.id || menuId===p.id) && (
              <div className="relative app-no-drag">
                <Button variant="ghost" className="px-2" onClick={()=>setMenuId(menuId===p.id?null:p.id)}>⋮</Button>
                {menuId===p.id && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl bg-[#2A2A2A] border border-neutral-700 shadow-xl z-10">
                    <button className="w-full text-left px-3 py-2 hover:bg-[#1F1F1F]" onClick={()=>onRename(p.id)}>Rename…</button>
                    <button className="w-full text-left px-3 py-2 hover:bg-[#1F1F1F]" onClick={()=>onExport(p.id)}>Export complete…</button>
                    <button className="w-full text-left px-3 py-2 hover:bg-[#1F1F1F] text-[#C65536]" onClick={()=>onDelete(p.id)}>Delete…</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const NotePadPanel: React.FC<{notes:string; onChange:(v:string)=>void}> = ({notes, onChange}) => (
  <div className="h-full flex flex-col bg-[#2A2A2A]">
    <SectionTitle>Note Pad</SectionTitle>
    <textarea value={notes} onChange={e=>onChange(e.target.value)} className="flex-1 m-3 rounded-2xl bg-neutral-900 p-3 outline-none" placeholder="Write markdown or plain text..." />
    <div className="flex items-center justify-between p-3">
      {/* Left: download (green circle like Send) */}
      <button
        className="w-10 h-10 rounded-full bg-brand hover:bg-brandHover text-black flex items-center justify-center app-no-drag"
        title="Download"
        aria-label="Download"
      >
        <Download className="w-4 h-4" strokeWidth={2.25} />
      </button>

      {/* Right: Save (green pill with black text) */}
      <Button variant="brandSolid" size="md" className="app-no-drag">Save</Button>
    </div>
  </div>
);

const ToolBoxPanel: React.FC = () => {
  const setDraft = useStore(s => s.setDraft);
  const [open, setOpen] = React.useState<string | null>(null);   // selected function
  const [hoverId, setHoverId] = React.useState<string | null>(null);

  const functions = [
    { key: 'color_residue', label: 'Color Residue', desc: 'Color a residue, optionally by chain.', examples: ['Color ALA in chain B green', 'Color CYS yellow']},
    { key: 'color_chain', label: 'Color Chain', desc: 'Color an entire chain.', examples: ['Color chain A red', 'Color all chains white']},
    { key: 'color_all', label: 'Color All', desc: 'Color everything.', examples: ['Color all green']},
    { key: 'set_background', label: 'Set Background', desc: 'Set background color.', examples: ['Set bg to black', 'Background white']},
    { key: 'rotate_view', label: 'Rotate View', desc: 'Rotate camera around an axis.', examples: ['Rotate 90 around X', 'Rotate 30 around Z']},
    { key: 'snapshot', label: 'Snapshot', desc: 'Save a PNG snapshot.', examples: ['Snapshot as figure.png']},
  ];

  const select = (id: string) => setOpen(id === open ? null : id);
  const apply = (t: string) => setDraft(t);

  return (
    <div className="h-full flex flex-col bg-[#2A2A2A]">
      <div className="px-4 py-3 text-sm uppercase tracking-wide text-neutral-300 bg-neutral-900">Tool Box</div>

      <div className="p-2 space-y-2 overflow-auto">
        {functions.map(f => {
          const isHover = hoverId === f.key;
          const isOpen  = open === f.key;
          return (
            <div key={f.key}
              onMouseEnter={()=>setHoverId(f.key)}
              onMouseLeave={()=>setHoverId(null)}
              className={`rounded-3xl px-3 py-2 cursor-pointer transition
                ${isOpen ? 'bg-[#171717]' : isHover ? 'bg-[#1F1F1F]' : ''}`}
              onClick={()=>select(f.key)}
            >
              {/* row label */}
              <div className="flex items-center justify-between">
                <div className="truncate font-medium">{f.label}</div>
                <div className="text-neutral-400">{isOpen ? '▴' : '▾'}</div>
              </div>

              {/* expansion */}
              {isOpen && (
                <div className="mt-2 rounded-2xl border border-brand p-3 bg-[#1F1F1F]">
                  <div className="mb-2 text-sm text-neutral-300">{f.desc}</div>
                  <ul className="list-disc ml-5 space-y-1">
                    {f.examples.map(ex => (
                      <li key={ex}
                          className="hover:text-brand cursor-pointer"
                          onClick={(e)=>{ e.stopPropagation(); apply(ex); }}>
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

const HelpPanel: React.FC = () => (
  <div className="h-full flex flex-col bg-[#2A2A2A]">
    <SectionTitle>Help</SectionTitle>
    <div className="p-4 space-y-2 text-sm">
      <Button variant="ghost">FAQ</Button>
      <Button variant="ghost">Release Notes</Button>
      <Button variant="ghost">Terms & Policies</Button>
      <Button variant="ghost">Website</Button>
    </div>
  </div>
);

const UpgradePanel: React.FC = () => (
  <div className="h-full flex flex-col bg-[#2A2A2A]">
    <SectionTitle>Upgrade</SectionTitle>
    <div className="p-4 grid grid-cols-1 gap-3">
      <div className="rounded-2xl border border-neutral-700 p-4">
        <div className="text-lg font-semibold">Free</div>
        <div className="text-3xl font-bold my-2">$0</div>
        <ul className="text-sm text-neutral-300 list-disc ml-5"><li>Basic commands</li><li>Local projects</li></ul>
        <Button className="mt-3">Get</Button>
      </div>
      <div className="rounded-2xl border border-neutral-700 p-4">
        <div className="text-lg font-semibold">Pro</div>
        <div className="text-3xl font-bold my-2">$9/mo</div>
        <ul className="text-sm text-neutral-300 list-disc ml-5"><li>All core tools</li><li>Priority updates</li></ul>
        <Button className="mt-3">Get</Button>
      </div>
      <div className="rounded-2xl border border-neutral-700 p-4">
        <div className="text-lg font-semibold">Enterprise</div>
        <div className="text-3xl font-bold my-2">Contact</div>
        <ul className="text-sm text-neutral-300 list-disc ml-5"><li>Team features</li><li>Support & SLAs</li></ul>
        <Button className="mt-3">Contact</Button>
      </div>
    </div>
  </div>
);
