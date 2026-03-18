import React from 'react';
import { useStore } from '../store';
import { ArrowUp } from 'lucide-react';
import { sendCommand, sendNL, snapshotWithPicker } from '../lib/bridge';
import { parsePromptToSpec } from '../lib/parse';
import {
  markCurrentProjectSessionDirty,
  refreshCurrentProjectSessionCache,
} from '../lib/projectSync';

export const PromptInput: React.FC = () => {
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const addLogToProject = useStore((s) => s.addLogToProject);
  const updateLogEntry = useStore((s) => s.updateLogEntry);
  const setProjectSessionDirty = useStore((s) => s.setProjectSessionDirty);
  const currentSelection = useStore((s) => s.currentSelection);
  const [sendingProjects, setSendingProjects] = React.useState<Record<string, number>>({});
  const selectionTagContext = React.useMemo(
    () =>
      currentSelection
        ? { label: currentSelection.label, target: currentSelection.target as any }
        : undefined,
    [currentSelection]
  );
  const sending = Boolean(sendingProjects[currentProjectId]);

  const refreshSessionCache = React.useCallback(() => {
    markCurrentProjectSessionDirty();
    void refreshCurrentProjectSessionCache();
  }, []);

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

  const markProjectSceneUpdated = React.useCallback(
    (projectId: string) => {
      if (useStore.getState().currentProjectId === projectId) {
        refreshSessionCache();
      } else {
        setProjectSessionDirty(projectId, true);
      }
    },
    [refreshSessionCache, setProjectSessionDirty]
  );

  const buildSelectionAwarePrompt = React.useCallback(
    (prompt: string) => {
      if (!currentSelection || !prompt.includes(currentSelection.label)) {
        return prompt;
      }
      return [
        `Selection tag context: ${currentSelection.label} => ${JSON.stringify(currentSelection.target)}`,
        `Selection description: ${currentSelection.description}`,
        `User request: ${prompt}`,
      ].join('\n');
    },
    [currentSelection]
  );

  const send = async () => {
    if (sending) return;
    const val = draft.trim();
    if (!val) return;
    const projectId = currentProjectId;

    setDraft('');
    beginProjectSend(projectId);

    // 1) Try to parse free-text into a command spec
    const spec = parsePromptToSpec(val, selectionTagContext ? { selectionTag: selectionTagContext } : undefined);
    if (!spec) {
      const logId = addLogToProject(projectId, {
        prompt: val,
        status: 'pending',
        message: 'Sending natural-language prompt…',
      });
      // Natural language — forward to bridge
      try {
        const resp = await sendNL(buildSelectionAwarePrompt(val), (progress) => {
          updateLogEntry(projectId, logId, { status: 'pending', message: progress.message });
        });
        if (resp.ok) {
          markProjectSceneUpdated(projectId);
          updateLogEntry(projectId, logId, {
            status: 'success',
            message: 'Natural-language command completed.',
          });
        } else {
          updateLogEntry(projectId, logId, {
            status: 'error',
            message: resp.error || 'Bridge not connected',
          });
        }
      } catch {
        updateLogEntry(projectId, logId, { status: 'error', message: 'Failed to reach bridge' });
      } finally {
        endProjectSend(projectId);
      }
      return;
    }

    // Snapshot with file picker
    if (spec.name === 'snapshot') {
      const logId = addLogToProject(projectId, {
        prompt: val,
        status: 'pending',
        message: 'Preparing snapshot…',
      });
      const suggested = (spec.arguments?.filename as string | undefined)?.trim();
      if (window.api?.showSaveDialog) {
        const res = await snapshotWithPicker(suggested, (progress) => {
          updateLogEntry(projectId, logId, { status: 'pending', message: progress.message });
        });
        if (res?.ok) {
          updateLogEntry(projectId, logId, { status: 'success', message: 'Snapshot saved.' });
        } else if (res?.canceled) {
          updateLogEntry(projectId, logId, { status: 'error', message: 'Snapshot canceled.' });
        } else {
          updateLogEntry(projectId, logId, {
            status: 'error',
            message: res?.error || 'Snapshot failed',
          });
        }
        endProjectSend(projectId);
        return;
      }
      // Fallback
      try {
        const fallbackName = suggested || 'snapshot.png';
        const r2 = await sendCommand(
          { name: 'snapshot', arguments: { filename: fallbackName } },
          (progress) => {
            updateLogEntry(projectId, logId, { status: 'pending', message: progress.message });
          }
        );
        updateLogEntry(projectId, logId, {
          status: r2.ok ? 'success' : 'error',
          message: r2.ok ? 'Snapshot saved.' : r2.error || 'Snapshot failed',
        });
      } catch {
        updateLogEntry(projectId, logId, { status: 'error', message: 'Snapshot failed' });
      }
      endProjectSend(projectId);
      return;
    }

    // 2) Fire to the local bridge with queue + retry
    const logId = addLogToProject(projectId, {
      prompt: val,
      status: 'pending',
      message: 'Sending command…',
    });
    try {
      const res = await sendCommand(spec, (progress) => {
        updateLogEntry(projectId, logId, { status: 'pending', message: progress.message });
      });
      if (res.ok) {
        markProjectSceneUpdated(projectId);
        updateLogEntry(projectId, logId, { status: 'success', message: 'Command completed in PyMOL.' });
      } else {
        updateLogEntry(projectId, logId, {
          status: 'error',
          message: res.error || 'Bridge not connected',
        });
      }
    } catch {
      updateLogEntry(projectId, logId, { status: 'error', message: 'Failed to reach bridge' });
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
      {currentSelection && (
        <div className="flex items-center gap-2 rounded-2xl bg-[#2A2A2A] px-3 py-2 text-xs text-neutral-300">
          <span className="uppercase tracking-wide text-neutral-500">Selection</span>
          <button
            type="button"
            onClick={() => setDraft(draft ? `${draft} ${currentSelection.label}` : currentSelection.label)}
            className="rounded-full bg-brand/20 px-2 py-1 font-medium text-brand hover:bg-brand/30 app-no-drag"
            title={`${currentSelection.description} • click to insert into prompt`}
          >
            {currentSelection.label}
          </button>
          <span className="truncate text-neutral-400" title={currentSelection.description}>
            {currentSelection.description}
          </span>
        </div>
      )}
      <div className="flex items-center">
        <input
          id="prompt-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe a single PyMOL action..."
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
        One PyMOL action per prompt. Temporary bridge outages retry automatically; plugin execution errors surface directly.
        {currentSelection ? ' Click the selection tag to reference the current picked residue or atom.' : ''}
      </div>
    </div>
  );
};
