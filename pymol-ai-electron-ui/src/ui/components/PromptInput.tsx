import React from 'react';
import { useStore } from '../store';
import { ArrowUp } from 'lucide-react';
import { sendNL } from '../lib/bridge';
import { parsePromptToSpec } from '../lib/parse';
import { executeCommandSpec, updateViewerStateAfterCommand } from '../lib/viewerActions';
import { globalViewerRef } from '../App';

export const PromptInput: React.FC = () => {
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const addLogToProject = useStore((s) => s.addLogToProject);
  const updateLogEntry = useStore((s) => s.updateLogEntry);
  const setProjectViewerState = useStore((s) => s.setProjectViewerState);
  const [sendingProjects, setSendingProjects] = React.useState<Record<string, number>>({});
  const sending = Boolean(sendingProjects[currentProjectId]);

  const beginProjectSend = React.useCallback((projectId: string) => {
    setSendingProjects((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] || 0) + 1,
    }));
  }, []);

  const endProjectSend = React.useCallback((projectId: string) => {
    setSendingProjects((prev) => {
      const nextCount = (prev[projectId] || 0) - 1;
      if (nextCount > 0) {
        return { ...prev, [projectId]: nextCount };
      }
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  }, []);

  /**
   * Execute a command spec against the active molecular viewer.
   * Returns the result for logging.
   */
  const executeSpec = React.useCallback(async (spec: { name: string; arguments?: Record<string, any> }) => {
    const viewer = globalViewerRef.current;
    if (!viewer) {
      return { ok: false, message: 'Viewer not ready. Load a structure first.' };
    }

    // Snapshot with file picker
    if (spec.name === 'snapshot') {
      const dataUri = await viewer.snapshot();
      if (!dataUri) return { ok: false, message: 'No viewer available for snapshot' };

      // Save via Electron dialog or direct download
      if (window.api?.showSaveDialog) {
        const filename = spec.arguments?.filename || 'nexmol-snapshot.png';
        window.api.showSaveDialog({
          title: 'Save Snapshot',
          defaultPath: filename,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        }).then(async (res) => {
          if (res.canceled || !res.filePath) return;
          // Convert data URI to base64
          const base64 = dataUri.split(',')[1];
          if (base64 && window.api?.writeFile) {
            await window.api.writeFile({ path: res.filePath, dataBase64: base64 });
          }
        });
        return { ok: true, message: 'Snapshot dialog opened.' };
      }

      // Fallback: direct download
      const link = document.createElement('a');
      link.download = spec.arguments?.filename || 'nexmol-snapshot.png';
      link.href = dataUri;
      link.click();
      return { ok: true, message: `Snapshot saved as ${link.download}` };
    }

    return executeCommandSpec(spec, viewer);
  }, []);

  const persistViewerState = React.useCallback(async (
    projectId: string,
    spec: { name: string; arguments?: Record<string, any> }
  ) => {
    const viewer = globalViewerRef.current;
    if (!viewer?.getSceneSnapshot) return;

    const snapshot = await viewer.getSceneSnapshot();
    const currentViewerState = useStore.getState().projectViewerStates[projectId];
    const nextState = updateViewerStateAfterCommand(currentViewerState, spec, snapshot);
    setProjectViewerState(projectId, nextState);
  }, [setProjectViewerState]);

  const send = async () => {
    if (sending) return;
    const val = draft.trim();
    if (!val) return;
    const projectId = currentProjectId;

    setDraft('');
    beginProjectSend(projectId);

    // 1) Try to parse free-text into a command spec locally
    const spec = parsePromptToSpec(val);

    if (spec) {
      // Locally parsed — execute directly against viewer
      const logId = addLogToProject(projectId, {
        prompt: val,
        status: 'pending',
        message: 'Executing command…',
        resolver: 'parser',
        normalizedSpec: spec,
      });

      try {
        const result = await executeSpec(spec);
        if (result.ok) {
          await persistViewerState(projectId, spec);
        }
        updateLogEntry(projectId, logId, {
          status: result.ok ? 'success' : 'error',
          message: result.message,
          diagnostic: result.ok ? undefined : result.message,
        });
      } catch (err: any) {
        updateLogEntry(projectId, logId, {
          status: 'error',
          message: err?.message || 'Command execution failed',
          diagnostic: err?.message || 'Command execution failed',
        });
      }
      endProjectSend(projectId);
      return;
    }

    // 2) Not locally parsable — send to AI backend
    const logId = addLogToProject(projectId, {
      prompt: val,
      status: 'pending',
      message: 'Sending to AI…',
      resolver: 'llm',
    });

    try {
      const resp = await sendNL(val, (progress) => {
        updateLogEntry(projectId, logId, { status: 'pending', message: progress.message });
      });

      if (resp.ok && resp.spec) {
        // Execute the AI-returned spec against the viewer
        const result = await executeSpec(resp.spec);
        if (result.ok) {
          await persistViewerState(projectId, resp.spec);
        }
        updateLogEntry(projectId, logId, {
          status: result.ok ? 'success' : 'error',
          message: result.message,
          normalizedSpec: resp.spec,
          diagnostic: result.ok ? undefined : result.message,
        });
      } else {
        updateLogEntry(projectId, logId, {
          status: 'error',
          message: resp.error || 'AI request failed',
          diagnostic: resp.error || 'AI request failed',
        });
      }
    } catch {
      updateLogEntry(projectId, logId, {
        status: 'error',
        message: 'Failed to reach backend',
        diagnostic: 'Failed to reach backend',
      });
    } finally {
      endProjectSend(projectId);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending) send();
    }
  };

  return (
    <div className="p-3 pt-2 flex flex-col gap-1.5">
      <div className="flex items-center">
        <input
          id="prompt-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe a molecular visualization action..."
          disabled={sending}
          className="flex-1 h-10 px-3 rounded-3xl bg-[#2A2A2A] outline-none disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="ml-2 w-10 h-10 rounded-full bg-brand hover:bg-brandHover text-black flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          title="Send"
          aria-label="Send"
        >
          <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
        </button>
      </div>

      <div className="text-xs text-neutral-400">
        One action per prompt. Try &quot;show ligand as sticks&quot; or &quot;color chain A red&quot;. Click one residue for current-selection prompts, or two residues for &quot;measure distance between selected&quot;.
      </div>
    </div>
  );
};
