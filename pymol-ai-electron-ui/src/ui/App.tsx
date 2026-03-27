import React from 'react';
import TopBar from './components/TopBar';
import { PromptLog } from './components/PromptLog';
import { PromptInput } from './components/PromptInput';
import { QuickActions } from './components/QuickActions';
import { RightPanels } from './components/RightPanels';
import MoleculeViewer, { MoleculeViewerHandle } from './components/MoleculeViewer';
import { useStore } from './store';
import { Button } from './components/Button';
import { Plus, Settings, Activity, Atom, MessageSquare, Box } from 'lucide-react';
import ApiKeyModal from './components/ApiKeyModal';
import OnboardingModal from './components/OnboardingModal';
import { checkApiKey } from './lib/bridge';

// Global viewer ref accessible by other modules
export let globalViewerRef: React.RefObject<MoleculeViewerHandle | null> = React.createRef();

type BottomTab = 'chat' | 'viewer';

const Toolbar: React.FC = () => {
  const setPanel = useStore((s) => s.setRightPanel);
  const forcePanel = useStore((s) => s.forceRightPanel);
  const addLog = useStore((s) => s.addLog);
  const [showHelp, setShowHelp] = React.useState(false);
  const helpRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!helpRef.current?.contains(e.target as Node)) setShowHelp(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  return (
    <div className="px-3 py-1.5 flex flex-wrap gap-2 bg-neutral-900/50 backdrop-blur-sm app-drag relative z-40">
      <Button size="sm" onClick={() => setPanel('molecules')} className="app-no-drag">
        <Atom className="w-3.5 h-3.5 mr-1" />
        Molecules
      </Button>
      <Button size="sm" onClick={() => setPanel('notepad')} className="app-no-drag">
        Note Pad
      </Button>
      <Button size="sm" onClick={() => setPanel('toolbox')} className="app-no-drag">
        Tool Box
      </Button>

      <div className="relative app-no-drag" ref={helpRef} onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
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
            <a
              className="block px-3 py-2 rounded-xl hover:bg-[#1F1F1F]"
              href="https://github.com/varunsharm16/pymol_ai_assistant"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              className="block px-3 py-2 rounded-xl hover:bg-[#1F1F1F]"
              href="https://github.com/varunsharm16/pymol_ai_assistant/issues"
              target="_blank"
              rel="noreferrer"
            >
              Report Issue
            </a>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2 app-no-drag">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPanel('healthcheck')}
          title="System Check"
        >
          <Activity className="w-3.5 h-3.5 mr-1" />
          Status
        </Button>
        <button
          onClick={() => setPanel('settings')}
          className="w-8 h-8 rounded-full bg-[#2A2A2A] hover:bg-[#1F1F1F] flex items-center justify-center"
          title="Settings"
        >
          <Settings className="w-4 h-4 text-neutral-300" />
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const showApiKeyModal = useStore((s) => s.showApiKeyModal);
  const setShowApiKeyModal = useStore((s) => s.setShowApiKeyModal);
  const setApiKeyConfigured = useStore((s) => s.setApiKeyConfigured);
  const forceRightPanel = useStore((s) => s.forceRightPanel);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [bottomTab, setBottomTab] = React.useState<BottomTab>('viewer');
  const onboardingKey = 'nexmol_onboarding_complete';

  const viewerRef = React.useRef<MoleculeViewerHandle>(null);
  // Expose globally so PromptInput and other components can access it
  React.useEffect(() => {
    (globalViewerRef as any).current = viewerRef.current;
  });

  // Check API key on mount
  React.useEffect(() => {
    checkApiKey().then((configured) => {
      setApiKeyConfigured(configured);
      if (!configured) setShowApiKeyModal(true);
    }).catch(() => {
      // Backend not running yet — don't show modal
    });
  }, []);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(onboardingKey) !== 'true') {
        setShowOnboarding(true);
      }
    } catch {
      setShowOnboarding(true);
    }
  }, []);

  return (
    <div
      className="h-screen w-screen flex flex-col"
      style={{ fontFamily: 'var(--font-sans, Arial, Verdana, system-ui)' }}
    >
      <TopBar />
      <Toolbar />
      <div className="flex-1 flex overflow-hidden border-t border-neutral-800">
        {/* Main content: viewer + chat */}
        <div className="min-w-0 flex-1 flex flex-col">
          {/* Tab bar */}
          <div className="flex items-center bg-neutral-900/60 border-b border-neutral-800 px-2">
            <button
              onClick={() => setBottomTab('viewer')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                bottomTab === 'viewer'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              Viewer
            </button>
            <button
              onClick={() => setBottomTab('chat')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                bottomTab === 'chat'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat Log
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 relative overflow-hidden">
            {/* Viewer always mounted for state persistence, hidden when not active */}
            <div
              className="absolute inset-0"
              style={{ display: bottomTab === 'viewer' ? 'block' : 'none' }}
            >
              <MoleculeViewer ref={viewerRef} className="w-full h-full" />
            </div>
            <div
              className="absolute inset-0 overflow-auto"
              style={{ display: bottomTab === 'chat' ? 'block' : 'none' }}
            >
              <PromptLog />
            </div>
          </div>

          {/* Prompt input always visible */}
          <PromptInput />
          <QuickActions />
        </div>
        <RightPanels />
      </div>
      <ApiKeyModal
        open={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
      />
      <OnboardingModal
        open={showOnboarding}
        onComplete={() => {
          try {
            window.localStorage.setItem(onboardingKey, 'true');
          } catch {
            // ignore storage failures and just close the modal
          }
          setShowOnboarding(false);
          forceRightPanel('healthcheck');
        }}
      />
    </div>
  );
};

export default App;
