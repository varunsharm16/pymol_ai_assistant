import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';

// 3Dmol.js types
declare const $3Dmol: any;

/**
 * Amino acid 3-letter codes used to identify protein residues.
 */
const AMINO_ACIDS = [
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
  'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL',
];

/** Common metal element symbols. */
const METAL_ELEMENTS = [
  'FE', 'ZN', 'MG', 'CA', 'MN', 'CO', 'NI', 'CU', 'MO', 'NA', 'K',
];

/** Chain color palette for color_by_chain. */
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
  if (kind === 'protein') return { resn: AMINO_ACIDS };
  if (kind === 'ligand') return { hetflag: true, not: { resn: ['HOH'] } };
  if (kind === 'water') return { resn: ['HOH', 'WAT'] };
  if (kind === 'metals') return { elem: METAL_ELEMENTS };
  if (kind === 'hydrogens') return { elem: 'H' };
  if (kind === 'current_selection') return {}; // fallback to all for now

  if (kind === 'chain') {
    const sel: Record<string, any> = { chain: spec.chain };
    return sel;
  }

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

  if (kind === 'object') {
    // 3Dmol.js uses model index — for now, return all
    return {};
  }

  return {};
}

/** Map representation name to 3Dmol style key. */
function reprToStyleKey(repr: string): string {
  const map: Record<string, string> = {
    cartoon: 'cartoon',
    sticks: 'stick',
    surface: 'surface',
    spheres: 'sphere',
    lines: 'line',
    mesh: 'mesh',
    dots: 'dots',
  };
  return map[repr] || repr;
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
      if (!containerRef.current) return;

      // Load 3Dmol.js from CDN if not already loaded
      const init = () => {
        if (typeof $3Dmol === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://3Dmol.org/build/3Dmol-min.js';
          script.async = true;
          script.onload = () => createViewer();
          document.head.appendChild(script);
        } else {
          createViewer();
        }
      };

      const createViewer = () => {
        if (!containerRef.current || viewerRef.current) return;
        viewerRef.current = $3Dmol.createViewer(containerRef.current, {
          backgroundColor: '#1a1a1a',
          antialias: true,
        });
        viewerRef.current.setViewStyle({ style: 'outline', color: '#333333', width: 0.02 });
        viewerRef.current.render();
      };

      init();

      return () => {
        if (viewerRef.current) {
          viewerRef.current.clear();
          viewerRef.current = null;
        }
      };
    }, []);

    const getViewer = useCallback(() => {
      return viewerRef.current;
    }, []);

    useImperativeHandle(ref, () => ({
      loadStructure(data: string, format: string) {
        const v = getViewer();
        if (!v) return;
        v.removeAllModels();
        v.removeAllLabels();
        v.removeAllShapes();
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
          v.addSurface($3Dmol.SurfaceType.VDW, { opacity: 0.8, color: 'white' }, atomSel);
        } else {
          v.addStyle(atomSel, { [styleKey]: {} });
        }
        v.render();
      },

      hideRepresentation(selection: SelectionSpec, representation: string) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);

        if (representation === 'everything' || representation === 'all') {
          v.setStyle(atomSel, {});
          v.removeAllSurfaces();
        } else if (representation === 'surface') {
          v.removeAllSurfaces();
        } else {
          const styleKey = reprToStyleKey(representation);
          v.removeStyle(atomSel, { [styleKey]: {} });
        }
        v.render();
      },

      isolateSelection(selection: SelectionSpec, representation?: string) {
        const v = getViewer();
        if (!v) return;
        v.setStyle({}, {});
        v.removeAllSurfaces();
        const atomSel = toAtomSel(selection);
        const styleKey = reprToStyleKey(representation || 'cartoon');
        v.setStyle(atomSel, { [styleKey]: {} });
        v.zoomTo(atomSel);
        v.render();
      },

      removeSelection(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        v.removeAtoms(atomSel);
        v.render();
      },

      colorSelection(selection: SelectionSpec, color: string) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        // Get current styles and update color
        v.setStyle(atomSel, {}, false);  // don't clear existing
        // Re-add with color — we need to use addStyle to preserve representations
        const model = v.getModel();
        if (!model) return;
        const atoms = v.selectedAtoms(atomSel);
        if (atoms.length === 0) return;

        // Get existing style and add color
        v.setStyle(atomSel, (prevStyle: any) => {
          const newStyle: Record<string, any> = {};
          for (const key of Object.keys(prevStyle || {})) {
            newStyle[key] = { ...prevStyle[key], color };
          }
          // If no style was set, default to cartoon
          if (Object.keys(newStyle).length === 0) {
            newStyle.cartoon = { color };
          }
          return newStyle;
        });
        v.render();
      },

      colorByChain(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        const atoms = v.selectedAtoms(atomSel);
        const chains = [...new Set(atoms.map((a: any) => a.chain as string))].sort();

        chains.forEach((chain, idx) => {
          const chainColor = CHAIN_COLORS[idx % CHAIN_COLORS.length];
          const chainSel = { ...atomSel, chain };
          v.setStyle(chainSel, (prevStyle: any) => {
            const newStyle: Record<string, any> = {};
            for (const key of Object.keys(prevStyle || {})) {
              newStyle[key] = { ...prevStyle[key], color: chainColor };
            }
            if (Object.keys(newStyle).length === 0) {
              newStyle.cartoon = { color: chainColor };
            }
            return newStyle;
          });
        });
        v.render();
      },

      colorByElement(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        v.setStyle(atomSel, (prevStyle: any) => {
          const newStyle: Record<string, any> = {};
          for (const key of Object.keys(prevStyle || {})) {
            newStyle[key] = { ...prevStyle[key], colorscheme: 'Jmol' };
          }
          if (Object.keys(newStyle).length === 0) {
            newStyle.stick = { colorscheme: 'Jmol' };
          }
          return newStyle;
        });
        v.render();
      },

      setTransparency(selection: SelectionSpec, value: number, representation: string) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        const opacity = 1.0 - value; // value is transparency, 3Dmol uses opacity

        if (representation === 'surface') {
          v.removeAllSurfaces();
          v.addSurface($3Dmol.SurfaceType.VDW, { opacity, color: 'white' }, atomSel);
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

        // Clear existing labels
        labelsRef.current.forEach((l: any) => v.removeLabel(l));
        labelsRef.current = [];

        if (mode === 'atom') {
          atoms.forEach((atom: any) => {
            const label = v.addLabel(atom.atom, {
              position: { x: atom.x, y: atom.y, z: atom.z },
              fontSize: 12,
              fontColor: 'white',
              backgroundOpacity: 0.6,
              backgroundColor: '#333333',
            });
            labelsRef.current.push(label);
          });
        } else {
          // Residue mode — label CA atoms (or first atom per residue)
          const seen = new Set<string>();
          atoms.forEach((atom: any) => {
            const key = `${atom.chain}_${atom.resn}_${atom.resi}`;
            if (seen.has(key)) return;
            if (atom.atom !== 'CA' && atom.atom !== 'P') return;
            seen.add(key);
            const label = v.addLabel(`${atom.resn}${atom.resi}`, {
              position: { x: atom.x, y: atom.y, z: atom.z },
              fontSize: 11,
              fontColor: 'white',
              backgroundOpacity: 0.5,
              backgroundColor: '#444444',
            });
            labelsRef.current.push(label);
          });
          // If no CA/P atoms found, label first atom per residue
          if (labelsRef.current.length === 0) {
            const seen2 = new Set<string>();
            atoms.forEach((atom: any) => {
              const key = `${atom.chain}_${atom.resn}_${atom.resi}`;
              if (seen2.has(key)) return;
              seen2.add(key);
              const label = v.addLabel(`${atom.resn}${atom.resi}`, {
                position: { x: atom.x, y: atom.y, z: atom.z },
                fontSize: 11,
                fontColor: 'white',
                backgroundOpacity: 0.5,
                backgroundColor: '#444444',
              });
              labelsRef.current.push(label);
            });
          }
        }
        v.render();
      },

      zoomTo(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        v.zoomTo(atomSel);
        v.render();
      },

      orientSelection(selection: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const atomSel = toAtomSel(selection);
        v.zoomTo(atomSel);
        v.render();
      },

      measureDistance(source: SelectionSpec, target: SelectionSpec) {
        const v = getViewer();
        if (!v) return;
        const sourceAtoms = v.selectedAtoms(toAtomSel(source));
        const targetAtoms = v.selectedAtoms(toAtomSel(target));

        if (sourceAtoms.length === 0 || targetAtoms.length === 0) return;

        // Use center of mass of each selection
        const center = (atoms: any[]) => {
          const sum = atoms.reduce(
            (acc: any, a: any) => ({ x: acc.x + a.x, y: acc.y + a.y, z: acc.z + a.z }),
            { x: 0, y: 0, z: 0 }
          );
          return { x: sum.x / atoms.length, y: sum.y / atoms.length, z: sum.z / atoms.length };
        };

        const p1 = center(sourceAtoms);
        const p2 = center(targetAtoms);

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Draw line
        const shape = v.addLine({
          start: p1,
          end: p2,
          color: '#ffff00',
          dashed: true,
        });
        shapesRef.current.push(shape);

        // Label with distance
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
        const axisLower = axis.toLowerCase();
        if (axisLower === 'x') v.rotate(angle, 'x');
        else if (axisLower === 'y') v.rotate(angle, 'y');
        else if (axisLower === 'z') v.rotate(angle, 'z');
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
