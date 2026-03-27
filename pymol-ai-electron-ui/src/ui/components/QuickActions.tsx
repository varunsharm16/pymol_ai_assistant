import React from 'react';
import { useStore } from '../store';
import { Button } from './Button';

/**
 * How to add more prompts:
 *  - Just append strings to PROMPTS below. Keep them short, command-like.
 *  - The first 6 in DEFAULTS are what appear on launch.
 */
const PROMPTS: string[] = [
  // --- Cleanup & selection ---
  'Remove waters',
  'Remove metals',
  'Remove hydrogens',
  'Isolate ligand',
  'Hide everything except ligand',
  'Zoom to ligand',
  'Orient on chain B',

  // --- Colors / selections ---
  'Color ALA green',
  'Colour CYS in chain B yellow',
  'color g in chain A red',
  'Colour ALA chain A blue',
  'Colour C in chain B magenta.',
  'Color all alanine residues in chain A pink',
  'Colour serine (SER) residues in chain D #FF00FF',
  'Color all leucine residues orange',
  'Colour P in magenta',
  '"Color all Lys in chain B red."',

  // --- Color by chain ---
  'Color chain A purple',
  'Make chain C blue',
  'Highlight only chain D in yellow.',
  'Colour chain E #0000FF',
  'Color all chains grey',

  // --- Color all ---
  'Color the entire molecule red',
  'colour everything grey',
  'Make the whole protein hotpink.',
  'color green',

  // --- Views / camera (single axis) ---
  'Rotate 45 degrees around X',
  'Rotate 90 around Y',
  'Rotate 30˚ around Z',
  'Rotate -15 around X',
  'Please rotate 60 degrees on the X-axis.',
  'Rotate around Y by 10 degrees',

  // --- Views / camera (multi axis) ---
  'Rotate 30 around X and 45 around Y.',
  'Rotate 20° around Y then 15° around Z',

  // --- Representations ---
  'Show the cartoon representation of the molecule',
  'Show ribbon',
  'Show surface representation of the protein',
  'Show ligand as sticks',
  'Show protein as cartoon',
  'Show sticks for all atoms',
  'Show spheres representation',
  'Show mesh representation',
  'Show dots on the surface',
  'Show lines',

  // --- Transparency / labels ---
  'Set surface transparency to 0.4 on protein',
  'Label residues in chain A',
  'Label ligand',

  // --- Analysis ---
  'Measure distance between ligand and residue ASP in chain B',

  // --- Snapshot / export ---
  'Save a PNG snapshot named test.png',
  'Save snapshot as my_view',
  'Save a snapshot called model1.png',
  'Take a pic named 123',


  // --- Background / style ---
  'Set bg to white',
  'Set background to #FFE000',
  'Set the background color to black.',
  'colour background lightblue',
  'Make the background white',
  'Set background to #202020.',

  // --- Misc useful ---
  'Center on chain A',
  'Color protein grey',
  'Color protein by chain',
  'Color ligand by element',
];

/** These 6 appear by default on launch (and when search is empty) */
const DEFAULTS = [
  'Remove waters',
  'Show ligand as sticks',
  'Set surface transparency to 0.4 on protein',
  'Label residues in chain A',
  'Show sequence as residue names',
  'Measure distance between ligand and residue ASP in chain B',
  'Color protein by chain',
];

/** Simple fuzzy scorer: tokens + prefix + substring. Higher is better. */
function score(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const s = candidate.toLowerCase();

  if (!q) return 0;
  let pts = 0;

  // Whole-string signals
  if (s === q) pts += 10;
  if (s.startsWith(q)) pts += 5;
  if (s.includes(q)) pts += 3;

  // Token match bonuses
  const qTokens = q.split(/\s+/).filter(Boolean);
  for (const t of qTokens) {
    if (s.startsWith(t)) pts += 2;
    if (s.includes(t)) pts += 1;
  }

  // Small prefix “typo forgiveness” (first 3 chars appear in order)
  const short = q.slice(0, 3);
  if (short && short.split('').every(ch => s.indexOf(ch) !== -1)) pts += 1;

  return pts;
}

export const QuickActions: React.FC = () => {
  const setDraft = useStore(s => s.setDraft);
  const [q, setQ] = React.useState('');

  const list = React.useMemo(() => {
    const term = q.trim();
    if (!term) return DEFAULTS;                         // show the same 6 by default
    // Score, sort, and take top results
    return PROMPTS
      .map(p => ({ p, pts: score(term, p) }))
      .filter(x => x.pts > 0)
      .sort((a, b) => b.pts - a.pts || a.p.localeCompare(b.p))
      .slice(0, 50)                                     // cap for UX
      .map(x => x.p);
  }, [q]);

  const apply = (t: string) => {
    setDraft(t);

    // Try to focus the main prompt input if present
    const el = document.querySelector<HTMLInputElement>(
      '#prompt-input, textarea[name="prompt"], textarea[aria-label="Prompt"], input[aria-label="Prompt"]'
    );
    el?.focus();
  };

  return (
    <div className="px-3 pb-3">
      <div className="text-[12px] uppercase tracking-wider text-neutral-300 mb-2">
        Quick actions
      </div>

      {/* Search + pill grid (no separate “top 3” row; no +/- toggle) */}
      <div className="rounded-2xl bg-surface2 p-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search quick actions"
          className="w-full mb-2 rounded-xl bg-surface p-2 outline-none"
          aria-label="Search quick actions"
        />

        <div className="flex flex-wrap gap-2 max-h-36 overflow-auto px-3 pb-3 pt-1 items-start content-start">
          {list.map((a) => (
            <Button
              key={a}
              type="button"
              variant="solid"
              size="sm"
              className="rounded-[999px] bg-surface hover:bg-surface2 outline-none h-auto min-h-[32px] px-3 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface2"
              onClick={() => apply(a)}
              title={a}
            >
              <span className="whitespace-normal break-words leading-tight block max-w-full">{a}</span>
            </Button>
          ))}

          {list.length === 0 && (
            <div className="text-neutral-400 text-sm px-1 py-1">
              No matches.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
