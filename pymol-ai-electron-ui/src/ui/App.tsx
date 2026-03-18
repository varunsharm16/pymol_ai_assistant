import React from 'react';
import TopBar from './components/TopBar';
import { PromptLog } from './components/PromptLog';
import { PromptInput } from './components/PromptInput';
import { QuickActions } from './components/QuickActions';
import { RightPanels } from './components/RightPanels';
import { useStore } from './store';
import { Button } from './components/Button';
import { Plus, Settings, Activity, Atom } from 'lucide-react';
import ApiKeyModal from './components/ApiKeyModal';
import OnboardingModal from './components/OnboardingModal';
import { checkApiKey, getCurrentSelection } from './lib/bridge';
import {
  createBlankProjectFlow,
  isTerminalProjectActionError,
  startFreshWorkspaceFlow,
} from './lib/projectSync';

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
      <button
        onClick={() => {
          createBlankProjectFlow('New Project').then((result) => {
            if (!result.ok && isTerminalProjectActionError('error' in result ? result.error : undefined)) {
              addLog({
                prompt: 'Create project',
                status: 'error',
                message: ('error' in result && result.error) || 'Failed to create project',
              });
              return;
            }
            forcePanel('projects');
          });
        }}
        className="app-no-drag w-8 h-8 rounded-full bg-brand hover:bg-brandHover text-black flex items-center justify-center"
        title="New Project"
        aria-label="New Project"
      >
        <Plus className="w-4 h-4" strokeWidth={2.25} />
      </button>

      <Button size="sm" onClick={() => setPanel('projects')} className="app-no-drag">
        Projects
      </Button>
      <Button size="sm" onClick={() => setPanel('notepad')} className="app-no-drag">
        Note Pad
      </Button>
      <Button size="sm" onClick={() => setPanel('toolbox')} className="app-no-drag">
        Tool Box
      </Button>
      <Button size="sm" onClick={() => setPanel('molecules')} className="app-no-drag">
        <Atom className="w-3.5 h-3.5 mr-1" />
        Molecules
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
  const setCurrentSelection = useStore((s) => s.setCurrentSelection);
  const forceRightPanel = useStore((s) => s.forceRightPanel);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const onboardingKey = 'pymol_ai_assistant_onboarding_complete';

  // Check API key on mount
  React.useEffect(() => {
    checkApiKey().then((configured) => {
      setApiKeyConfigured(configured);
      if (!configured) setShowApiKeyModal(true);
    }).catch(() => {
      // Bridge not running yet — don't show modal
    });
  }, []);

  React.useEffect(() => {
    startFreshWorkspaceFlow().then((result) => {
      if (!result.ok) {
        useStore.getState().addLog({
          prompt: 'Initialize workspace',
          status: 'error',
          message: result.error || 'Failed to initialize blank workspace.',
        });
      }
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

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      if (document.hidden) {
        timeoutId = window.setTimeout(poll, 1500);
        return;
      }
      const res = await getCurrentSelection().catch(() => ({ ok: false as const }));
      if (!cancelled) {
        setCurrentSelection(res.ok ? res.selection || null : null);
        timeoutId = window.setTimeout(poll, 1200);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [setCurrentSelection]);

  return (
    <div
      className="h-screen w-screen flex flex-col"
      style={{ fontFamily: 'var(--font-sans, Arial, Verdana, system-ui)' }}
    >
      <TopBar />
      <Toolbar />
      <div className="flex-1 flex overflow-hidden border-t border-neutral-800">
        <div className="min-w-0 flex-1">
          <PromptLog />
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
