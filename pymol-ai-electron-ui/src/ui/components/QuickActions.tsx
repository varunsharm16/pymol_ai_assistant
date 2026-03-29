import React from 'react';
import { useStore } from '../store';

const PROMPTS: string[] = [
  'Remove waters',
  'Remove metals',
  'Remove hydrogens',
  'Remove selected',
  'Isolate ligand',
  'Hide everything except ligand',
  'Zoom to ligand',
  'Center on chain A',
  'Color selected blue',
  'Color protein grey',
  'Color protein by chain',
  'Color ligand by element',
  'Color chain A green',
  'Show cartoon on protein',
  'Show sticks on ligand',
  'Show sticks on selected',
  'Show surface on protein',
  'Show surface on selected',
  'Show mesh on protein',
  'Hide surface on protein',
  'Set surface transparency to 0.4 on protein',
  'Set sticks transparency to 0.4 on selected',
  'Label selected',
  'Label all alanines in chain A',
  'Clear selected label',
  'Clear labels',
  'Measure distance between selected',
  'Measure distance between ligand and residue ASP in chain B',
  'Clear measurements',
  'Show sequence',
  'Hide sequence',
  'Save a PNG snapshot named figure.png',
  'Set background to black',
  'Set background to white',
];

function score(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const s = candidate.toLowerCase();

  if (!q) return 0;
  let pts = 0;

  if (s === q) pts += 10;
  if (s.startsWith(q)) pts += 5;
  if (s.includes(q)) pts += 3;

  const qTokens = q.split(/\s+/).filter(Boolean);
  for (const token of qTokens) {
    if (s.startsWith(token)) pts += 2;
    if (s.includes(token)) pts += 1;
  }

  const short = q.slice(0, 3);
  if (short && short.split('').every((ch) => s.indexOf(ch) !== -1)) pts += 1;

  return pts;
}

export const QuickActions: React.FC<{ query: string }> = ({ query }) => {
  const setDraft = useStore((s) => s.setDraft);
  const q = query.trim();

  const list = React.useMemo(() => {
    if (!q) return [];
    return PROMPTS
      .map((prompt) => ({ prompt, pts: score(q, prompt) }))
      .filter((entry) => entry.pts > 0)
      .sort((a, b) => b.pts - a.pts || a.prompt.localeCompare(b.prompt))
      .slice(0, 6)
      .map((entry) => entry.prompt);
  }, [q]);

  const apply = React.useCallback((prompt: string) => {
    setDraft(prompt);
    const el = document.querySelector<HTMLInputElement>('#prompt-input');
    el?.focus();
  }, [setDraft]);

  if (!q || list.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-700 bg-[#111111] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
      <div className="mb-2 px-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
        Suggestions
      </div>
      <div className="flex flex-col gap-1">
        {list.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => apply(prompt)}
            className="w-full rounded-xl border border-neutral-700 bg-[#171717] px-3 py-2 text-left text-sm text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-[#1F1F1F]"
            title={prompt}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
};
