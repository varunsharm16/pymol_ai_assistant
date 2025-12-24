import React from 'react';
import TopBar from './components/TopBar';
import { PromptLog } from './components/PromptLog';
import { PromptInput } from './components/PromptInput';
import { QuickActions } from './components/QuickActions';
import { RightPanels } from './components/RightPanels';
import { useStore } from './store';
import { Button } from './components/Button';
import { Plus } from 'lucide-react';
import UpgradeModal from './components/UpgradeModal';

const Toolbar: React.FC<{ onOpenUpgrade: () => void }> = ({ onOpenUpgrade }) => {
  const setPanel = useStore(s => s.setRightPanel);
  const createProject = useStore(s => s.createProject);
  const [showHelp, setShowHelp] = React.useState(false);
  const helpRef = React.useRef<HTMLDivElement>(null);
  const forcePanel = useStore(s => s.forceRightPanel);
  
  

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!helpRef.current?.contains(e.target as Node)) setShowHelp(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  return (
    <div className="px-3 py-1.5 flex flex-wrap gap-2 bg-neutral-900/50 backdrop-blur-sm app-drag relative z-40">
      <button
        onClick={()=>{
          createProject('New Project');
          forcePanel('projects');   // ← always opens Projects; never toggles closed
        }}
        className="app-no-drag w-8 h-8 rounded-full bg-brand hover:bg-brandHover text-black flex items-center justify-center"
        title="New Project"
        aria-label="New Project"
      >
        <Plus className="w-4 h-4" strokeWidth={2.25} />
      </button>

      <Button size="sm" onClick={()=>setPanel('projects')} className="app-no-drag">Projects</Button>
      <Button size="sm" onClick={()=>setPanel('notepad')} className="app-no-drag">Note Pad</Button>
      <Button size="sm" onClick={()=>setPanel('toolbox')} className="app-no-drag">Tool Box</Button>

      <div className="relative app-no-drag" ref={helpRef} onPointerDown={(e)=> e.stopPropagation()}>
        <button
          type="button"
          onClick={()=> setShowHelp(v=>!v)}
          className="px-3 py-1.5 rounded-full bg-[#2A2A2A] hover:bg-[#1F1F1F] text-neutral-200 text-sm"
          aria-haspopup="menu"
          aria-expanded={showHelp}
        >
          Help
        </button>

        {showHelp && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-xl bg-[#2A2A2A] border border-neutral-700 z-50"
          >
            <a className="block px-3 py-2 rounded-xl hover:bg-[#1F1F1F]" href="https://example.com/faq" target="_blank" rel="noreferrer">FAQ</a>
            <a className="block px-3 py-2 rounded-xl hover:bg-[#1F1F1F]" href="https://example.com/release-notes" target="_blank" rel="noreferrer">Release Notes</a>
            <a className="block px-3 py-2 rounded-xl hover:bg-[#1F1F1F]" href="https://example.com/terms" target="_blank" rel="noreferrer">Terms &amp; Policies</a>
            <a className="block px-3 py-2 rounded-xl hover:bg-[#1F1F1F]" href="https://example.com" target="_blank" rel="noreferrer">Portfolio Website</a>
          </div>
        )}
      </div>

      <div className="ml-auto app-no-drag">
        <Button size="sm" variant="brandSolid" onClick={onOpenUpgrade}>Upgrade</Button>
      </div>
    </div>
  );
};


const App: React.FC = () => {
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  return (
    <div className="h-screen w-screen flex flex-col" style={{ fontFamily: 'var(--font-sans, Arial, Verdana, system-ui)' }}>
      <TopBar />
      <Toolbar onOpenUpgrade={() => setUpgradeOpen(true)} />
      <div className="flex-1 flex overflow-hidden border-t border-neutral-800">
        <div className="min-w-0 flex-1">
          <PromptLog />
          <PromptInput />
          <QuickActions />
        </div>
        <RightPanels />
      </div>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
};

export default App;
