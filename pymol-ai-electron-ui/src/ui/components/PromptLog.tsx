import React from 'react';
import { useStore } from '../store';
import { EllipsisVertical } from 'lucide-react';

export const PromptLog: React.FC = () => {
  const currentId = useStore(s => s.currentProjectId);
  const logMap = useStore(s => s.logs);
  const logs = logMap[currentId] || [];

  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  return (
    // The scroll container stays here; sticky header is a child of the same container.
    <div className="flex flex-col gap-1.5 overflow-auto h-[56vh] md:h-[52vh] relative bg-[#171717]">

      {/* Sticky, translucent, blurred header with correct stacking */}
      <div className="sticky top-0 z-30">
        <div className="relative">
          {/* HEADER ROW (above the fade) */}
          <div className="relative z-20 flex items-center justify-between px-3 py-2
                          bg-[#171717]/70 backdrop-blur-md
                          supports-[backdrop-filter]:bg-[#171717]/50">
            <div className="text-[12px] uppercase tracking-wider text-neutral-300">
              Prompt Log
            </div>

            <div className="relative app-no-drag" ref={menuRef}>
              <button
                onClick={(e)=>{ e.stopPropagation(); setMenuOpen(v=>!v); }}
                className="w-9 h-9 rounded-full bg-brand hover:bg-brandHover text-black flex items-center justify-center"
                title="Prompt log options"
                aria-label="Prompt log options"
              >
                <EllipsisVertical className="w-4 h-4" strokeWidth={2.25} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#2A2A2A] border border-neutral-700 shadow-xl z-40">
                  <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1F1F1F]">Download as PDF</button>
                  <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1F1F1F]">Download as DOCX</button>
                  <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1F1F1F]">Download as Markdown</button>
                  <div className="h-px bg-neutral-700 my-1" />
                  <button className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1F1F1F] text-[#C65536]">Delete prompt log…</button>
                </div>
              )}
            </div>
          </div>

          {/* FADE (under the header row) */}
          <div
            className="pointer-events-none absolute inset-x-0 -bottom-1 h-8 z-10
                      bg-gradient-to-b from-[#171717]/70 to-transparent
                      supports-[backdrop-filter]:from-[#171717]/50"
          />
        </div>
      </div>



      {/* Log items */}
      <div className="px-3 pb-2">
        {logs.length === 0 && (
          <div className="text-neutral-400 text-sm">No prompts yet.</div>
        )}

        {logs.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 py-1.5">
            <span
              className={`px-2 py-0.5 text-[11px] rounded font-semibold
                ${entry.status === 'success' ? 'bg-brand/20 text-brand' : 'bg-[#3b1a14] text-[#C65536]'}`}
            >
              {entry.status}
            </span>
            <div className="flex flex-col leading-tight">
              <div className="text-neutral-100">“{entry.prompt}”</div>
              <div className="text-[12px] text-neutral-400">
                {new Date(entry.ts).toLocaleTimeString()} • Queued for execution
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};