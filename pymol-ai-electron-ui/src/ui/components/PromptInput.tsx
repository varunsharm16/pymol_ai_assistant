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
  const addLog = useStore((s) => s.addLog);
  const updateLog = useStore((s) => s.updateLog);
  const [sending, setSending] = React.useState(false);

  const refreshSessionCache = React.useCallback(() => {
    markCurrentProjectSessionDirty();
    void refreshCurrentProjectSessionCache();
  }, []);

  const send = async () => {
    if (sending) return;
    const val = draft.trim();
    if (!val) return;

    setDraft('');
    setSending(true);

    // 1) Try to parse free-text into a command spec
    const spec = parsePromptToSpec(val);
    if (!spec) {
      const logId = addLog({ prompt: val, status: 'pending', message: 'Sending natural-language prompt…' });
      // Natural language — forward to bridge
      try {
        const resp = await sendNL(val, (progress) => {
          updateLog(logId, { status: 'pending', message: progress.message });
        });
        if (resp.ok) {
          refreshSessionCache();
          updateLog(logId, { status: 'success', message: 'Natural-language command completed.' });
        } else {
          updateLog(logId, { status: 'error', message: resp.error || 'Bridge not connected' });
        }
      } catch {
        updateLog(logId, { status: 'error', message: 'Failed to reach bridge' });
      } finally {
        setSending(false);
      }
      return;
    }

    // Snapshot with file picker
    if (spec.name === 'snapshot') {
      const logId = addLog({ prompt: val, status: 'pending', message: 'Preparing snapshot…' });
      const suggested = (spec.arguments?.filename as string | undefined)?.trim();
      if (window.api?.showSaveDialog) {
        const res = await snapshotWithPicker(suggested, (progress) => {
          updateLog(logId, { status: 'pending', message: progress.message });
        });
        if (res?.ok) {
          updateLog(logId, { status: 'success', message: 'Snapshot saved.' });
        } else if (res?.canceled) {
          updateLog(logId, { status: 'error', message: 'Snapshot canceled.' });
        } else {
          updateLog(logId, { status: 'error', message: res?.error || 'Snapshot failed' });
        }
        setSending(false);
        return;
      }
      // Fallback
      try {
        const fallbackName = suggested || 'snapshot.png';
        const r2 = await sendCommand(
          { name: 'snapshot', arguments: { filename: fallbackName } },
          (progress) => {
            updateLog(logId, { status: 'pending', message: progress.message });
          }
        );
        updateLog(logId, {
          status: r2.ok ? 'success' : 'error',
          message: r2.ok ? 'Snapshot saved.' : r2.error || 'Snapshot failed',
        });
      } catch {
        updateLog(logId, { status: 'error', message: 'Snapshot failed' });
      }
      setSending(false);
      return;
    }

    // 2) Fire to the local bridge with queue + retry
    const logId = addLog({ prompt: val, status: 'pending', message: 'Sending command…' });
    try {
      const res = await sendCommand(spec, (progress) => {
        updateLog(logId, { status: 'pending', message: progress.message });
      });
      if (res.ok) {
        refreshSessionCache();
        updateLog(logId, { status: 'success', message: 'Command completed in PyMOL.' });
      } else {
        updateLog(logId, { status: 'error', message: res.error || 'Bridge not connected' });
      }
    } catch {
      updateLog(logId, { status: 'error', message: 'Failed to reach bridge' });
    } finally {
      setSending(false);
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
        Temporary bridge outages retry automatically. Plugin timeouts and execution errors surface directly.
      </div>
    </div>
  );
};
