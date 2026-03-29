import React from 'react';
import { EllipsisVertical } from 'lucide-react';
import { useStore } from '../store';
import ConfirmDialog from './ConfirmDialog';
import { exportPromptLog } from '../lib/promptLogExport';
import { writeFile } from '../lib/bridge';

type ExportFormat = 'md' | 'pdf' | 'docx';

function extensionLabel(format: ExportFormat) {
  if (format === 'md') return 'Markdown';
  if (format === 'pdf') return 'PDF';
  return 'DOCX';
}

function specSummary(spec?: { name: string; arguments?: Record<string, any> }) {
  if (!spec) return '';
  return spec.name.replace(/_/g, ' ');
}

export const PromptLog: React.FC = () => {
  const currentId = useStore((s) => s.currentProjectId);
  const project = useStore((s) => s.projects.find((entry) => entry.id === s.currentProjectId));
  const logs = useStore((s) => s.logs[currentId] || []);
  const clearProjectLogs = useStore((s) => s.clearProjectLogs);

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const menuRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = body.scrollHeight;
  }, [logs.length]);

  const handleExport = async (format: ExportFormat) => {
    setActionError('');
    if (!logs.length || !window.api?.showSaveDialog) return;

    const payload = exportPromptLog(project?.name || 'Project', logs, format);
    const save = await window.api.showSaveDialog({
      title: `Export Prompt Log as ${extensionLabel(format)}`,
      defaultPath: payload.filename,
      filters: [{ name: extensionLabel(format), extensions: [payload.filename.split('.').pop() || format] }],
    });
    setMenuOpen(false);
    if (!save || save.canceled || !save.filePath) return;

    const result = await writeFile(save.filePath, payload.bytes);
    if (!result.ok) setActionError(result.error || `Failed to export ${extensionLabel(format)}.`);
  };

  return (
    <div className="relative min-h-0 flex-1 flex flex-col bg-[#171717]">
      <div className="sticky top-0 z-30">
        <div className="relative">
          <div className="relative z-20 flex items-center justify-between px-3 py-2 bg-[#171717]/70 backdrop-blur-md supports-[backdrop-filter]:bg-[#171717]/50">
            <div className="text-[12px] uppercase tracking-wider text-neutral-300">
              Prompt Log
            </div>

            <div className="relative app-no-drag" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((value) => !value);
                }}
                className="w-9 h-9 rounded-full bg-brand hover:bg-brandHover text-black flex items-center justify-center"
                title="Prompt log options"
                aria-label="Prompt log options"
              >
                <EllipsisVertical className="w-4 h-4" strokeWidth={2.25} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#2A2A2A] border border-neutral-700 shadow-xl z-40">
                  <button
                    disabled={!logs.length}
                    onClick={() => handleExport('pdf')}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1F1F1F] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download as PDF
                  </button>
                  <button
                    disabled={!logs.length}
                    onClick={() => handleExport('docx')}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1F1F1F] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download as DOCX
                  </button>
                  <button
                    disabled={!logs.length}
                    onClick={() => handleExport('md')}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1F1F1F] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download as Markdown
                  </button>
                  <div className="h-px bg-neutral-700 my-1" />
                  <button
                    disabled={!logs.length}
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmClear(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1F1F1F] text-[#C65536] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete prompt log…
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-8 z-10 bg-gradient-to-b from-[#171717]/70 to-transparent supports-[backdrop-filter]:from-[#171717]/50" />
        </div>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto px-3 pb-2">
        {actionError && <div className="mb-2 text-sm text-[#C65536]">{actionError}</div>}

        {logs.length === 0 && (
          <div className="text-neutral-400 text-sm">No prompts yet.</div>
        )}

        {logs.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 py-1.5">
            <span
              className={`px-2 py-0.5 text-[11px] rounded font-semibold ${
                entry.status === 'success'
                  ? 'bg-brand/20 text-brand'
                  : entry.status === 'pending'
                    ? 'bg-yellow-500/20 text-yellow-300'
                    : 'bg-[#3b1a14] text-[#C65536]'
              }`}
            >
              {entry.status}
            </span>
            <div className="flex flex-col leading-tight">
              <div className="text-neutral-100">“{entry.prompt}”</div>
              {(entry.resolver || entry.normalizedSpec) && (
                <div
                  className="text-[11px] text-neutral-500"
                  title={entry.normalizedSpec ? JSON.stringify(entry.normalizedSpec, null, 2) : undefined}
                >
                  {[entry.resolver, specSummary(entry.normalizedSpec)].filter(Boolean).join(' • ')}
                </div>
              )}
              <div className="text-[12px] text-neutral-400">
                {new Date(entry.ts).toLocaleTimeString()} • {entry.message}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Delete prompt log?"
        body="This clears the prompt log for the current project only. Notes, molecule state, and other projects are unaffected."
        confirmLabel="Delete Log"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearProjectLogs(currentId);
          setConfirmClear(false);
        }}
      />
    </div>
  );
};
