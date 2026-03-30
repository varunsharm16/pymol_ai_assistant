import React from 'react';
import TopBar from './components/TopBar';
import { RightPanels } from './components/RightPanels';
import MoleculeViewer, { MoleculeViewerHandle } from './components/MoleculeViewer';
import { useStore } from './store';
import { Button } from './components/Button';
import { Settings, Activity, Atom, MessageSquare, FolderKanban, List, FileText, Wrench, CircleHelp } from 'lucide-react';
import ApiKeyModal from './components/ApiKeyModal';
import OnboardingModal from './components/OnboardingModal';
import { checkApiKey } from './lib/bridge';
import { restoreViewerState } from './lib/viewerActions';

// Global viewer ref accessible by other modules
export let globalViewerRef: React.RefObject<MoleculeViewerHandle | null> = React.createRef();

const Toolbar: React.FC = () => {
  const setPanel = useStore((s) => s.setRightPanel);
  const toggleSequenceUi = useStore((s) => s.toggleSequenceUi);
  const sequenceOpen = useStore((s) => s.sequenceUi.open);
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
      <Button size="sm" onClick={() => setPanel('projects')} className="app-no-drag">
        <FolderKanban className="w-3.5 h-3.5 mr-1" />
        Projects
      </Button>
      <Button size="sm" onClick={() => setPanel('notepad')} className="app-no-drag">
        <FileText className="w-3.5 h-3.5 mr-1" />
        Note Pad
      </Button>
      <Button size="sm" onClick={() => setPanel('toolbox')} className="app-no-drag">
        <Wrench className="w-3.5 h-3.5 mr-1" />
        Tool Box
      </Button>
      <Button size="sm" onClick={() => setPanel('chat')} className="app-no-drag">
        <MessageSquare className="w-3.5 h-3.5 mr-1" />
        Chat
      </Button>
      <Button
        size="sm"
        onClick={() => toggleSequenceUi()}
        className={`app-no-drag ${sequenceOpen ? 'bg-[#1F1F1F] hover:bg-[#171717]' : ''}`}
        variant="solid"
      >
        <List className="w-3.5 h-3.5 mr-1" />
        Sequence
      </Button>

      <div className="relative app-no-drag" ref={helpRef} onPointerDown={(e) => e.stopPropagation()}>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowHelp((v) => !v)}
          className={showHelp ? 'bg-[#1F1F1F] hover:bg-[#171717]' : ''}
          aria-haspopup="menu"
          aria-expanded={showHelp}
        >
          <CircleHelp className="w-3.5 h-3.5 mr-1" />
          Help
        </Button>

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
  const currentProjectId = useStore((s) => s.currentProjectId);
  const currentProjectStructure = useStore((s) => s.projectStructures[s.currentProjectId]);
  const addLogToProject = useStore((s) => s.addLogToProject);
  const viewerReady = useStore((s) => s.viewerReady);
  const viewerExpanded = useStore((s) => s.viewerExpanded);
  const sequenceOpen = useStore((s) => s.sequenceUi.open);
  const setSequenceUiOpen = useStore((s) => s.setSequenceUiOpen);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const onboardingKey = 'nexmol_onboarding_complete';
  const restoreSequenceAfterExpandedRef = React.useRef(false);

  const viewerRef = React.useRef<MoleculeViewerHandle>(null);
  // Expose globally so PromptInput and other components can access it
  React.useEffect(() => {
    (globalViewerRef as any).current = viewerRef.current;
  });

  React.useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const viewer = viewerRef.current;
      if (!viewer || !viewerReady) return;
      const latestViewerState = useStore.getState().projectViewerStates[currentProjectId];

      if (!currentProjectStructure?.data) {
        await viewer.clear();
        if (cancelled) return;
        const restoreErrors = await restoreViewerState(latestViewerState, viewer);
        if (!cancelled && restoreErrors.length) {
          addLogToProject(currentProjectId, {
            prompt: 'Restore project scene',
            status: 'error',
            message: restoreErrors.join(' | '),
          });
        }
        return;
      }

      try {
        await viewer.loadStructure(currentProjectStructure.data, currentProjectStructure.format, {
          objectName: currentProjectStructure.objectName,
        });

        if (cancelled) return;
        const restoreErrors = await restoreViewerState(latestViewerState, viewer);
        if (!cancelled && restoreErrors.length) {
          addLogToProject(currentProjectId, {
            prompt: 'Restore project scene',
            status: 'error',
            message: restoreErrors.join(' | '),
          });
        }
      } catch (error: any) {
        if (!cancelled) {
          addLogToProject(currentProjectId, {
            prompt: 'Restore project scene',
            status: 'error',
            message: error?.message || 'Failed to restore viewer scene.',
          });
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [addLogToProject, currentProjectId, currentProjectStructure, viewerReady]);

  React.useEffect(() => {
    if (viewerExpanded) {
      if (sequenceOpen) {
        restoreSequenceAfterExpandedRef.current = true;
        setSequenceUiOpen(false);
      }
      return;
    }

    if (restoreSequenceAfterExpandedRef.current) {
      restoreSequenceAfterExpandedRef.current = false;
      setSequenceUiOpen(true);
    }
  }, [sequenceOpen, setSequenceUiOpen, viewerExpanded]);

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
      {!viewerExpanded && <TopBar />}
      {!viewerExpanded && <Toolbar />}
      <div className="flex-1 flex overflow-hidden border-t border-neutral-800">
        {/* Main content: viewer */}
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex-1 relative overflow-hidden">
            <MoleculeViewer ref={viewerRef} className="w-full h-full" />
          </div>
        </div>
        {!viewerExpanded && <RightPanels />}
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
