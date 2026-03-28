import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as $3Dmol from '3dmol';

/**
 * Amino acid 3-letter codes used to identify protein residues.
 */
const AMINO_ACIDS = new Set([
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
  'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL',
]);

/** Common metal element symbols. */
const METAL_ELEMENTS = [
  'FE', 'ZN', 'MG', 'CA', 'MN', 'CO', 'NI', 'CU', 'MO', 'NA', 'K',
];

/** Chain color palette. */
const CHAIN_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
];

export type SelectionSpec = {
  kind: string;
  chain?: string;
  residue?: string;
  resi?: string;
  atom?: string;
  object?: string;
};

export interface MoleculeViewerHandle {
  loadStructure: (data: string, format: string) => void;
  showRepresentation: (selection: SelectionSpec, representation: string) => void;
  hideRepresentation: (selection: SelectionSpec, representation: string) => void;
  isolateSelection: (selection: SelectionSpec, representation?: string) => void;
  removeSelection: (selection: SelectionSpec) => void;
  colorSelection: (selection: SelectionSpec, color: string) => void;
  colorByChain: (selection: SelectionSpec) => void;
  colorByElement: (selection: SelectionSpec) => void;
  setTransparency: (selection: SelectionSpec, value: number, representation: string) => void;
  labelSelection: (selection: SelectionSpec, mode: string) => void;
  zoomTo: (selection: SelectionSpec) => void;
  orientSelection: (selection: SelectionSpec) => void;
  measureDistance: (source: SelectionSpec, target: SelectionSpec) => void;
  setBackground: (color: string) => void;
  rotateView: (axis: string, angle: number) => void;
  snapshot: () => string | null;
  clear: () => void;
  hasStructure: () => boolean;
}

/**
 * Convert a normalized SelectionSpec to a 3Dmol.js AtomSelectionSpec.
 */
function toAtomSel(spec: SelectionSpec): Record<string, any> {
  const kind = spec.kind;
  if (kind === 'all') return {};
  if (kind === 'protein') return { resn: [...AMINO_ACIDS] };
  if (kind === 'ligand') return { hetflag: true, not: { resn: ['HOH', 'WAT'] } };
  if (kind === 'water') return { resn: ['HOH', 'WAT'] };
  if (kind === 'metals') return { elem: METAL_ELEMENTS };
  if (kind === 'hydrogens') return { elem: 'H' };
  if (kind === 'current_selection') return {};

  if (kind === 'chain') return { chain: spec.chain };

  if (kind === 'residue') {
    const sel: Record<string, any> = { resn: spec.residue };
    if (spec.resi) sel.resi = parseInt(spec.resi, 10) || spec.resi;
    if (spec.chain) sel.chain = spec.chain;
    return sel;
  }

  if (kind === 'atom') {
    const sel: Record<string, any> = { atom: spec.atom };
    if (spec.residue) sel.resn = spec.residue;
    if (spec.resi) sel.resi = parseInt(spec.resi, 10) || spec.resi;
    if (spec.chain) sel.chain = spec.chain;
    return sel;
  }

  if (kind === 'object') return {};
  return {};
}

/** Map representation name to 3Dmol style key. */
function reprToStyleKey(repr: string): string {
  const map: Record<string, string> = {
    cartoon: 'cartoon',
    ribbon: 'cartoon',
    sticks: 'stick',
    stick: 'stick',
    surface: 'surface',
    spheres: 'sphere',
    sphere: 'sphere',
    lines: 'line',
    line: 'line',
    mesh: 'mesh',
    dots: 'dots',
  };
  return map[repr] || repr;
}

/** Guess a default representation for a selection kind. */
function defaultReprForKind(kind: string): string {
  if (kind === 'ligand' || kind === 'residue' || kind === 'atom' || kind === 'metals') {
    return 'stick';
  }
  return 'cartoon';
}

const MoleculeViewer = forwardRef<MoleculeViewerHandle, { className?: string }>(
  ({ className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const structureLoaded = useRef(false);
    const labelsRef = useRef<any[]>([]);
    const shapesRef = useRef<any[]>([]);

    // Initialize 3Dmol viewer
    useEffect(() => {
      if (!containerRef.current || viewerRef.current) return;

      viewerRef.current = ($3Dmol as any).createViewer(containerRef.current, {
        backgroundColor: '#1a1a1a',
        antialias: true,
      });
      viewerRef.current.render();

      return () => {
        if (viewerRef.current) {
          viewerRef.current.clear();
          viewerRef.current = null;
        }
      };
    }, []);

    const getViewer = useCallback(() => viewerRef.current, []);

    useImperativeHandle(ref, () => ({
      loadStructure(data: string, format: string) {
        const v = getViewer();
        if (!v) return;
        v.removeAllModels();
        v.removeAllLabels();
        v.removeAllShapes();
        v.removeAllSurfaces();
        labelsRef.current = [];
        shapesRef.current = [];

        v.addModel(data, format);
        v.setStyle({}, { cartoon: { color: 'spectrum' } });
        v.zoomTo();
        v.render();
        structureLoaded.current = true;
      },

      showRepresentation(selection: SelectionSpec, representation: string) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        const styleKey = reprToStyleKey(representation);

        if (styleKey === 'surface') {
          v.addSurface(($3Dmol as any).SurfaceType.VDW, { opacity: 0.8, color: 'white' }, atomSel);
        } else {
          // addStyle adds on top of existing styles
          v.addStyle(atomSel, { [styleKey]: {} });
        }
        v.render();
      },

      hideRepresentation(selection: SelectionSpec, representation: string) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);

        if (!representation || representation === 'everything' || representation === 'all') {
          // Clear all styles on the selection
          v.setStyle(atomSel, {});
          v.removeAllSurfaces();
        } else if (representation === 'surface') {
          v.removeAllSurfaces();
        } else {
          // 3Dmol.js has no removeStyle for a specific type.
          // Clear all styles on these atoms — user can re-show what they want.
          v.setStyle(atomSel, {});
        }
        v.render();
      },

      isolateSelection(selection: SelectionSpec, representation?: string) {
        const v = getViewer();
        if (!v) return;
        // Hide everything
        v.setStyle({}, {});
        v.removeAllSurfaces();
        // Show just the selection
        const atomSel = toAtomSel(selection);
        const styleKey = reprToStyleKey(representation || defaultReprForKind(selection.kind));
        v.setStyle(atomSel, { [styleKey]: {} });
        v.zoomTo(atomSel);
        v.render();
      },

      removeSelection(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        // removeAtoms is destructive — removes atoms from the model
        const atoms = v.selectedAtoms(atomSel);
        if (atoms.length > 0) {
          for (const atom of atoms) {
            v.removeAtoms(atomSel);
            break; // removeAtoms removes all matching at once
          }
        }
        v.render();
      },

      colorSelection(selection: SelectionSpec, color: string) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        // Determine a good default representation for this selection type
        const repr = defaultReprForKind(selection.kind);
        // setStyle replaces styles — apply representation with color
        v.setStyle(atomSel, { [repr]: { color } });
        v.render();
      },

      colorByChain(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        const atoms = v.selectedAtoms(atomSel);
        const chainSet = new Set<string>();
        for (const a of atoms) {
          if (a.chain) chainSet.add(a.chain);
        }
        const chains = [...chainSet].sort();
        const repr = defaultReprForKind(selection.kind);

        for (let i = 0; i < chains.length; i++) {
          const chainColor = CHAIN_COLORS[i % CHAIN_COLORS.length];
          const chainSel = { ...atomSel, chain: chains[i] };
          v.setStyle(chainSel, { [repr]: { color: chainColor } });
        }
        v.render();
      },

      colorByElement(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        // Jmol color scheme colors by element
        const repr = defaultReprForKind(selection.kind);
        v.setStyle(atomSel, { [repr]: { colorscheme: 'Jmol' } });
        v.render();
      },

      setTransparency(selection: SelectionSpec, value: number, representation: string) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        const opacity = Math.max(0, Math.min(1, 1.0 - value));

        if (representation === 'surface') {
          v.removeAllSurfaces();
          v.addSurface(($3Dmol as any).SurfaceType.VDW, { opacity, color: 'white' }, atomSel);
        } else {
          const styleKey = reprToStyleKey(representation);
          v.setStyle(atomSel, { [styleKey]: { opacity } });
        }
        v.render();
      },

      labelSelection(selection: SelectionSpec, mode: string) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        const atoms = v.selectedAtoms(atomSel);

        // Clear previous labels
        for (const l of labelsRef.current) {
          try { v.removeLabel(l); } catch { /* ignore */ }
        }
        labelsRef.current = [];

        if (mode === 'atom') {
          for (const atom of atoms) {
            const label = v.addLabel(atom.atom, {
              position: { x: atom.x, y: atom.y, z: atom.z },
              fontSize: 12,
              fontColor: 'white',
              backgroundOpacity: 0.6,
              backgroundColor: '#333333',
            });
            labelsRef.current.push(label);
          }
        } else {
          // Residue mode — label CA or P atoms (one per residue)
          const seen = new Set<string>();
          for (const atom of atoms) {
            const key = `${atom.chain}_${atom.resn}_${atom.resi}`;
            if (seen.has(key)) continue;
            // Prefer CA (protein) or P (nucleic acid) or first atom
            if (atom.atom !== 'CA' && atom.atom !== 'P') continue;
            seen.add(key);
            const label = v.addLabel(`${atom.resn}${atom.resi}`, {
              position: { x: atom.x, y: atom.y, z: atom.z },
              fontSize: 11,
              fontColor: 'white',
              backgroundOpacity: 0.5,
              backgroundColor: '#444444',
            });
            labelsRef.current.push(label);
          }
          // Fallback: if no CA/P atoms, label first atom per residue
          if (labelsRef.current.length === 0) {
            const seen2 = new Set<string>();
            for (const atom of atoms) {
              const key = `${atom.chain}_${atom.resn}_${atom.resi}`;
              if (seen2.has(key)) continue;
              seen2.add(key);
              const label = v.addLabel(`${atom.resn}${atom.resi}`, {
                position: { x: atom.x, y: atom.y, z: atom.z },
                fontSize: 11,
                fontColor: 'white',
                backgroundOpacity: 0.5,
                backgroundColor: '#444444',
              });
              labelsRef.current.push(label);
            }
          }
        }
        v.render();
      },

      zoomTo(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        v.zoomTo(toAtomSel(selection));
        v.render();
      },

      orientSelection(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        v.zoomTo(toAtomSel(selection));
        v.render();
      },

      measureDistance(source: SelectionSpec, target: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const sourceAtoms = v.selectedAtoms(toAtomSel(source));
        const targetAtoms = v.selectedAtoms(toAtomSel(target));
        if (sourceAtoms.length === 0 || targetAtoms.length === 0) return;

        const center = (atoms: any[]) => {
          let sx = 0, sy = 0, sz = 0;
          for (const a of atoms) { sx += a.x; sy += a.y; sz += a.z; }
          const n = atoms.length;
          return { x: sx / n, y: sy / n, z: sz / n };
        };

        const p1 = center(sourceAtoms);
        const p2 = center(targetAtoms);
        const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const shape = v.addLine({ start: p1, end: p2, color: '#ffff00', dashed: true });
        shapesRef.current.push(shape);

        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: (p1.z + p2.z) / 2 };
        const label = v.addLabel(`${dist.toFixed(1)} Å`, {
          position: mid,
          fontSize: 12,
          fontColor: '#ffff00',
          backgroundOpacity: 0.7,
          backgroundColor: '#222222',
        });
        labelsRef.current.push(label);
        v.render();
      },

      setBackground(color: string) {
        const v = getViewer();
        if (!v) return;
        v.setBackgroundColor(color);
        v.render();
      },

      rotateView(axis: string, angle: number) {
        const v = getViewer();
        if (!v) return;
        v.rotate(angle, axis.toLowerCase());
        v.render();
      },

      snapshot(): string | null {
        const v = getViewer();
        if (!v) return null;
        return v.pngURI();
      },

      clear() {
        const v = getViewer();
        if (!v) return;
        v.removeAllModels();
        v.removeAllLabels();
        v.removeAllShapes();
        v.removeAllSurfaces();
        labelsRef.current = [];
        shapesRef.current = [];
        structureLoaded.current = false;
        v.render();
      },

      hasStructure() {
        return structureLoaded.current;
      },
    }));

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          minHeight: '300px',
        }}
      />
    );
  }
);

MoleculeViewer.displayName = 'MoleculeViewer';
export default MoleculeViewer;
