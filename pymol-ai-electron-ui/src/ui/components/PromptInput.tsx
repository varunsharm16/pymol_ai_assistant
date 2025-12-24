import React from 'react';
import { useStore } from '../store';
import { ArrowUp } from 'lucide-react';
import { sendCommand, snapshotWithPicker } from "../lib/bridge";
import { parsePromptToSpec } from "../lib/parse";
import { sendNL } from "../lib/nl";

export const PromptInput: React.FC = () => {
  const draft = useStore(s => s.draft);
  const setDraft = useStore(s => s.setDraft);
  const addLog = useStore(s => s.addLog);
  const [sending, setSending] = React.useState(false);

  const send = async () => {
    if (sending) return; // guard against double-press
    const val = draft.trim();
    if (!val) return;
    

    // Clear immediately for snappier UX and to avoid lingering text
    setDraft('');
    setSending(true);

    // 1) Try to parse free‑text into a command spec
    const spec = parsePromptToSpec(val);
    if (!spec) {
      try {
        const resp = await fetch("http://127.0.0.1:5179/nl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: val }),
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data && data.ok) {
          addLog({ prompt: val, status: 'success', message: 'Sent to PyMOL (NL)' });
        } else {
          const msg = (data && data.error) || 'Bridge not connected';
          addLog({ prompt: val, status: 'error', message: msg });
        }
      } catch (e) {
        addLog({ prompt: val, status: 'error', message: 'Failed to reach bridge' });
      } finally {
        setSending(false);
      }
      return;
    }

    // If the parsed spec is a snapshot without a filename, ask user where to save
    if (spec && spec.name === 'snapshot') {
      const suggested = (spec?.arguments?.filename as string | undefined)?.trim();

      // Prefer native save dialog if available; otherwise fall back
      if ((window as any).api?.showSaveDialog) {
        const res = await snapshotWithPicker(suggested);
        if (res && res.ok) {
          addLog({ prompt: val, status: 'success', message: 'Snapshot saved' });
          setSending(false);
          return;
        }
        if (res && res.canceled) {
          addLog({ prompt: val, status: 'error', message: 'Snapshot canceled' });
          setSending(false);
          return;
        }
        // else dialog failed → fall through to fallback
      }

      // Fallback: send relative filename to plugin; it will normalize to ~/Downloads/PyMOL_Snapshots
      try {
        const fallbackName = suggested && suggested.length ? suggested : 'snapshot.png';
        const r2 = await sendCommand({ name: 'snapshot', arguments: { filename: fallbackName } });
        if (r2 && r2.ok) {
          addLog({ prompt: val, status: 'success', message: 'Snapshot saved (default folder)' });
        } else {
          addLog({ prompt: val, status: 'error', message: (r2 && r2.error) || 'Snapshot failed' });
        }
      } catch (e) {
        addLog({ prompt: val, status: 'error', message: 'Snapshot failed' });
      }

      setSending(false);
      return; 
    }


    // 2) Fire to the local bridge
    try {
      const res = await sendCommand(spec);
      if (res && res.ok) {
        addLog({ prompt: val, status: 'success', message: 'Sent to PyMOL' });
      } else {
        const msg = (res && res.error) || 'Bridge not connected';
        addLog({ prompt: val, status: 'error', message: msg });
      }
    } catch (e) {
      addLog({ prompt: val, status: 'error', message: 'Failed to reach bridge' });
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
      {/* input row */}
      <div className="flex items-center">
        <input
          id="prompt-input"
          value={draft}
          onChange={e=>setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe a single PyMOL action..."
          disabled={sending}
          className="flex-1 h-10 sm:h-10 md:h-10 px-3 rounded-3xl bg-[#2A2A2A] outline-none disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className={`ml-2 w-10 h-10 rounded-full bg-brand hover:bg-brandHover text-black flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed`}
          title="Send" aria-label="Send"
        >
          <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
        </button>
      </div>

      <div className="text-xs text-neutral-400">Note: PyMOL AI Assistant can be inconsistent.</div>
    </div>
  );
};
