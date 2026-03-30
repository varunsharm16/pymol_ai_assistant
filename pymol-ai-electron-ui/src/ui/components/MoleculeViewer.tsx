import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginContextContainer } from 'molstar/lib/mol-plugin-ui/plugin';
import { SequenceView } from 'molstar/lib/mol-plugin-ui/sequence';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Color } from 'molstar/lib/mol-util/color';
import { Mat3, Mat4, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { OrderedSet, SortedArray } from 'molstar/lib/mol-data/int';
import { changeCameraRotation } from 'molstar/lib/mol-plugin-state/manager/focus-camera/orient-axes';
import {
  Structure,
  StructureElement,
  StructureProperties,
  StructureSelection,
} from 'molstar/lib/mol-model/structure';
import { StructureSelectionQueries } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import { setStructureOverpaint, clearStructureOverpaint } from 'molstar/lib/mol-plugin-state/helpers/structure-overpaint';
import { setStructureTransparency, clearStructureTransparency } from 'molstar/lib/mol-plugin-state/helpers/structure-transparency';
import { DEFAULT_SEQUENCE_PANEL_WIDTH, useStore, type SequenceUiMode } from '../store';
import nexmolViewerMark from '../../assets/nexmol-app-icon.png';

const CHAIN_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
];

const ELEMENT_COLORS: Record<string, string> = {
  H: '#ffffff',
  C: '#909090',
  N: '#3050f8',
  O: '#ff0d0d',
  S: '#ffff30',
  P: '#ff8000',
  F: '#90e050',
  CL: '#1ff01f',
  BR: '#a62929',
  I: '#940094',
  FE: '#e06633',
  ZN: '#7d80b0',
  MG: '#8aff00',
  CA: '#3dff00',
  NA: '#ab5cf2',
  K: '#8f40d4',
};

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  magenta: '#ff00ff',
  cyan: '#00ffff',
  pink: '#ffc0cb',
  brown: '#8b4513',
  grey: '#808080',
  gray: '#808080',
  lime: '#00ff00',
  olive: '#808000',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  silver: '#c0c0c0',
  gold: '#ffd700',
};

const METAL_ELEMENTS = [
  'FE', 'ZN', 'MG', 'CA', 'MN', 'CO', 'NI', 'CU', 'MO', 'NA', 'K',
];

const DEFAULT_BACKGROUND = '#1a1a1a';
const MIN_SEQUENCE_PANEL_WIDTH = DEFAULT_SEQUENCE_PANEL_WIDTH / 2;

export type SelectionSpec = {
  kind: string;
  chain?: string;
  residue?: string;
  resi?: string;
  atom?: string;
  object?: string;
  allMatches?: boolean;
  items?: SelectionSpec[];
};

export interface MoleculeViewerHandle {
  loadStructure: (data: string, format: string, options?: { objectName?: string }) => Promise<void>;
  showRepresentation: (selection: SelectionSpec, representation: string) => Promise<void>;
  hideRepresentation: (selection: SelectionSpec, representation: string) => Promise<void>;
  isolateSelection: (selection: SelectionSpec, representation?: string) => Promise<void>;
  removeSelection: (selection: SelectionSpec) => Promise<void>;
  colorSelection: (selection: SelectionSpec, color: string) => Promise<void>;
  colorByChain: (selection: SelectionSpec) => Promise<void>;
  colorByElement: (selection: SelectionSpec) => Promise<void>;
  setTransparency: (selection: SelectionSpec, value: number, representation: string) => Promise<void>;
  labelSelection: (selection: SelectionSpec, mode: string) => Promise<void>;
  clearLabels: (selection?: SelectionSpec) => Promise<void>;
  zoomTo: (selection: SelectionSpec) => Promise<void>;
  orientSelection: (selection: SelectionSpec) => Promise<void>;
  measureDistance: (source: SelectionSpec, target: SelectionSpec) => Promise<void>;
  clearDistanceMeasurements: () => Promise<void>;
  setBackground: (color: string) => Promise<void>;
  rotateView: (axis: string, angle: number) => Promise<void>;
  snapshot: () => Promise<string | null>;
  clear: () => Promise<void>;
  hasStructure: () => boolean;
  hasCurrentSelection: () => boolean;
  getCurrentSelection: () => SelectionSpec | null;
  getCurrentObjectName: () => string | null;
  getSceneSnapshot: () => Promise<{ backgroundColor?: string; cameraSnapshot?: any }>;
  applySceneSnapshot: (snapshot?: { backgroundColor?: string; cameraSnapshot?: any }) => Promise<void>;
}

type LoadedStructure = {
  cell: any;
  components: any[];
};

type SelectionResolution = {
  loci: any;
  error?: string;
};

type StoredStructure = {
  data: string;
  format: string;
  objectName?: string;
};

type ColorOperation =
  | { kind: 'solid'; key: string; selection: SelectionSpec; color: string }
  | { kind: 'chain'; key: string; selection: SelectionSpec }
  | { kind: 'element'; key: string; selection: SelectionSpec };

type TransparencyOperation = {
  key: string;
  selection: SelectionSpec;
  value: number;
  representation?: string;
};

type LabelOperation = {
  key: string;
  selection: SelectionSpec;
  mode: string;
};

type DistanceOperation = {
  key: string;
  source: SelectionSpec;
  target: SelectionSpec;
  mode?: 'selected_pair' | 'explicit';
};

type AnchorCandidate = {
  key: string;
  first: any;
  ca?: any;
  p?: any;
  heavy?: any;
};

const SequencePanel: React.FC<{
  plugin: PluginUIContext;
  mode: SequenceUiMode;
  open: boolean;
  width: number;
  onWidthChange: (width: number) => void;
}> = ({ plugin, mode, open, width, onWidthChange }) => {
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rightEdge = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth ?? DEFAULT_SEQUENCE_PANEL_WIDTH;
      const nextWidth = Math.min(
        DEFAULT_SEQUENCE_PANEL_WIDTH,
        Math.max(MIN_SEQUENCE_PANEL_WIDTH, rightEdge - event.clientX)
      );
      onWidthChange(Math.round(nextWidth));
    };

    const handlePointerUp = () => {
      setDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragging, onWidthChange]);

  return (
    <div
      ref={panelRef}
      className={`nexmol-sequence-panel relative h-full shrink-0 overflow-hidden bg-[#161616] transition-[width,flex-basis,opacity,border-color] duration-300 ease-in-out ${
        open ? 'border-l border-neutral-800 opacity-100' : 'border-l border-transparent opacity-0 pointer-events-none'
      } ${dragging ? 'select-none' : ''}`}
      style={{ width: open ? width : 0, flexBasis: open ? width : 0 }}
    >
      <button
        type="button"
        aria-label="Resize sequence panel"
        className={`group absolute inset-y-0 left-0 z-20 w-2 -translate-x-1/2 cursor-col-resize bg-transparent ${
          open ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        onPointerDown={(event) => {
          if (!open) return;
          event.preventDefault();
          setDragging(true);
        }}
      >
        <span
          className={`pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full transition-colors ${
            dragging ? 'w-[3px] bg-brand/80' : 'w-[3px] bg-transparent group-hover:bg-brand/55'
          }`}
        />
      </button>
      <PluginContextContainer plugin={plugin}>
        <SequenceView key={mode} defaultMode={mode} />
      </PluginContextContainer>
    </div>
  );
};

function describeSelection(spec: SelectionSpec): string {
  const kind = spec.kind;
  const withScope = (base: string) => {
    let desc = base;
    if (spec.chain) desc += ` in chain ${spec.chain}`;
    if (spec.object) desc += ` in object ${spec.object}`;
    return desc;
  };
  if (kind === 'all') return 'everything';
  if (kind === 'protein') return withScope('protein');
  if (kind === 'ligand') return withScope('ligand');
  if (kind === 'water') return withScope('waters');
  if (kind === 'metals') return withScope('metals');
  if (kind === 'hydrogens') return withScope('hydrogens');
  if (kind === 'active_selection') return 'selected residues';
  if (kind === 'current_selection') return 'current selection';
  if (kind === 'selection_set') return 'saved selection set';
  if (kind === 'chain') return `chain ${spec.chain}`;
  if (kind === 'residue') {
    if (spec.allMatches && !spec.resi) {
      let desc = `all ${spec.residue} residues`;
      if (spec.chain) desc += ` in chain ${spec.chain}`;
      if (spec.object) desc += ` in object ${spec.object}`;
      return desc;
    }
    let desc = `residue ${spec.residue}${spec.resi ? ` ${spec.resi}` : ''}`;
    if (spec.chain) desc += ` in chain ${spec.chain}`;
    if (spec.object) desc += ` in object ${spec.object}`;
    return desc;
  }
  if (kind === 'atom') return `atom ${spec.atom}${spec.residue ? ` in ${spec.residue}` : ''}${spec.resi ? ` ${spec.resi}` : ''}${spec.chain ? ` chain ${spec.chain}` : ''}`;
  if (kind === 'object') return `object ${spec.object}`;
  return kind;
}

function selectionKey(spec: SelectionSpec): string {
  if (spec.kind === 'selection_set') {
    return JSON.stringify({
      kind: 'selection_set',
      items: (spec.items || []).map(selectionKey).sort(),
    });
  }
  if (spec.kind === 'residue') {
    return JSON.stringify({
      kind: spec.kind,
      chain: spec.chain,
      residue: spec.residue,
      resi: spec.resi,
      object: spec.object,
    });
  }
  return JSON.stringify(spec);
}

function distanceOperationKey(source: SelectionSpec, target: SelectionSpec): string {
  const pair = [selectionKey(source), selectionKey(target)].sort();
  return `distance:${pair[0]}:${pair[1]}`;
}

function representationToMolstarType(repr: string): string {
  const key = repr.trim().toLowerCase();
  const map: Record<string, string> = {
    cartoon: 'cartoon',
    ribbon: 'cartoon',
    stick: 'ball-and-stick',
    sticks: 'ball-and-stick',
    sphere: 'spacefill',
    spheres: 'spacefill',
    surface: 'molecular-surface',
    mesh: 'molecular-surface',
    line: 'line',
    lines: 'line',
    dots: 'point',
    point: 'point',
  };
  return map[key] || 'cartoon';
}

function representationTypeFilter(repr: string): string[] {
  return [representationToMolstarType(repr)];
}

function representationTag(repr: string): string {
  const key = repr.trim().toLowerCase();
  if (key === 'mesh') return 'nexmol-repr-mesh';
  if (key === 'surface') return 'nexmol-repr-surface';
  return `nexmol-repr-${representationToMolstarType(repr)}`;
}

function isSurfaceRepresentation(repr: string): boolean {
  const type = representationToMolstarType(repr);
  return type === 'molecular-surface';
}

function surfaceVisualsForRepresentation(repr: string): string[] | undefined {
  const key = repr.trim().toLowerCase();
  if (key === 'mesh') {
    return ['molecular-surface-wireframe'];
  }
  if (key === 'surface') {
    return ['molecular-surface-mesh'];
  }
  return undefined;
}

function defaultRepresentationForKind(kind: string): string {
  if (kind === 'ligand' || kind === 'residue' || kind === 'atom' || kind === 'metals') {
    return 'ball-and-stick';
  }
  if (kind === 'water' || kind === 'hydrogens') {
    return 'line';
  }
  return 'cartoon';
}

function normalizeFormat(format: string): string {
  const key = format.trim().toLowerCase();
  const map: Record<string, string> = {
    mmcif: 'mmcif',
    cif: 'mmcif',
    pdb: 'pdb',
    mol2: 'mol2',
    sdf: 'mol',
    mol: 'mol',
    xyz: 'xyz',
  };
  return map[key] || 'pdb';
}

function colorToMolstar(value: string): ReturnType<typeof Color.fromHexStyle> {
  const color = value.trim().toLowerCase();
  if (!color) {
    throw new Error('Color is required.');
  }

  if (NAMED_COLORS[color]) {
    return Color.fromHexStyle(NAMED_COLORS[color]);
  }

  const normalized = color.startsWith('#') ? color : `#${color}`;
  if (/^#[0-9a-f]{6}$/i.test(normalized) || /^#[0-9a-f]{3}$/i.test(normalized)) {
    return Color.fromHexStyle(normalized);
  }

  throw new Error(`Unsupported color: ${value}`);
}

function selectionSchema(spec: SelectionSpec): any {
  if (spec.kind === 'metals') {
    return {
      items: {
        type_symbol: METAL_ELEMENTS,
        ...(spec.chain ? { auth_asym_id: spec.chain } : {}),
      },
    };
  }
  if (spec.kind === 'hydrogens') {
    return {
      type_symbol: 'H',
      ...(spec.chain ? { auth_asym_id: spec.chain } : {}),
    };
  }
  if (spec.kind === 'chain') {
    return { auth_asym_id: spec.chain };
  }
  if (spec.kind === 'residue') {
    const schema: Record<string, any> = { label_comp_id: spec.residue };
    if (spec.resi) {
      const parsed = Number.parseInt(spec.resi, 10);
      schema.auth_seq_id = Number.isNaN(parsed) ? undefined : parsed;
    }
    if (spec.chain) schema.auth_asym_id = spec.chain;
    return schema;
  }
  if (spec.kind === 'atom') {
    const schema: Record<string, any> = { label_atom_id: spec.atom };
    if (spec.residue) schema.label_comp_id = spec.residue;
    if (spec.resi) {
      const parsed = Number.parseInt(spec.resi, 10);
      schema.auth_seq_id = Number.isNaN(parsed) ? undefined : parsed;
    }
    if (spec.chain) schema.auth_asym_id = spec.chain;
    return schema;
  }
  return undefined;
}

const MoleculeViewer = forwardRef<MoleculeViewerHandle, { className?: string }>(
  ({ className }, ref) => {
    const viewerReady = useStore((s) => s.viewerReady);
    const sequenceUiOpen = useStore((s) => s.sequenceUi.open);
    const sequenceUiMode = useStore((s) => s.sequenceUi.mode);
    const sequenceUiWidth = useStore((s) => s.sequenceUi.width);
    const setSequenceUiWidth = useStore((s) => s.setSequenceUiWidth);
    const setCurrentViewerSelection = useStore((s) => s.setCurrentViewerSelection);
    const setActiveViewerSelections = useStore((s) => s.setActiveViewerSelections);
    const setSelectedResiduePair = useStore((s) => s.setSelectedResiduePair);
    const clearViewerSelectionState = useStore((s) => s.clearViewerSelectionState);
    const setViewerReady = useStore((s) => s.setViewerReady);
    const setViewerExpanded = useStore((s) => s.setViewerExpanded);
    const containerRef = useRef<HTMLDivElement>(null);
    const pluginRef = useRef<PluginUIContext | null>(null);
    const structureLoadedRef = useRef(false);
    const [hasStructure, setHasStructure] = useState(false);
    const currentSelectionRef = useRef<SelectionSpec | null>(null);
    const currentSelectionLociRef = useRef<any | null>(null);
    const activeSelectionsRef = useRef<SelectionSpec[]>([]);
    const selectedPairRef = useRef<SelectionSpec[]>([]);
    const currentObjectNameRef = useRef<string | null>(null);
    const queueRef = useRef<Promise<unknown>>(Promise.resolve());
    const lastStructureRef = useRef<StoredStructure | null>(null);
    const backgroundColorRef = useRef(DEFAULT_BACKGROUND);
    const colorOpsRef = useRef<ColorOperation[]>([]);
    const transparencyOpsRef = useRef<TransparencyOperation[]>([]);
    const labelOpsRef = useRef<LabelOperation[]>([]);
    const clearedLabelKeysRef = useRef<Set<string>>(new Set());
    const distanceOpsRef = useRef<DistanceOperation[]>([]);
    const previousSequenceUiOpenRef = useRef(sequenceUiOpen);

    const objectMatchesCurrent = useCallback((objectName?: string) => {
      if (!objectName) return true;
      const current = currentObjectNameRef.current;
      if (!current) return false;
      return current.toLowerCase() === objectName.trim().toLowerCase();
    }, []);

    const enqueue = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
      const run = queueRef.current.then(task, task);
      queueRef.current = run.then(() => undefined, () => undefined);
      return run;
    }, []);

    const getPlugin = useCallback(() => {
      const plugin = pluginRef.current;
      if (!plugin) throw new Error('Viewer not ready yet.');
      return plugin;
    }, []);

    const getLoadedStructure = useCallback((): LoadedStructure => {
      const plugin = getPlugin();
      const structure = plugin.managers.structure.hierarchy.current.structures[0];
      if (!structure?.cell?.obj?.data) {
        throw new Error('Load a structure first.');
      }
      return structure as LoadedStructure;
    }, [getPlugin]);

    const getRootStructure = useCallback(() => {
      const loaded = getLoadedStructure();
      return loaded.cell.obj.data.root || loaded.cell.obj.data;
    }, [getLoadedStructure]);

    const getAllComponents = useCallback(() => {
      const plugin = getPlugin();
      return plugin.managers.structure.hierarchy.current.structures.flatMap((s: any) => s.components || []);
    }, [getPlugin]);

    const syncSelectionState = useCallback((activeSelections: SelectionSpec[] = activeSelectionsRef.current) => {
      activeSelectionsRef.current = activeSelections;
      setCurrentViewerSelection(currentSelectionRef.current as any);
      setActiveViewerSelections([...activeSelections] as any);
      setSelectedResiduePair([...selectedPairRef.current] as any);
    }, [setActiveViewerSelections, setCurrentViewerSelection, setSelectedResiduePair]);

    const clearSelectionState = useCallback(() => {
      currentSelectionRef.current = null;
      currentSelectionLociRef.current = null;
      activeSelectionsRef.current = [];
      selectedPairRef.current = [];
      clearViewerSelectionState();
    }, [clearViewerSelectionState]);

    const resetSceneOps = useCallback(() => {
      colorOpsRef.current = [];
      transparencyOpsRef.current = [];
      labelOpsRef.current = [];
      clearedLabelKeysRef.current = new Set();
      distanceOpsRef.current = [];
    }, []);

    const applyViewerBackgroundCss = useCallback((color?: string) => {
      containerRef.current?.style.setProperty('--nexmol-viewer-bg', color || DEFAULT_BACKGROUND);
    }, []);

    const refitStructureIntoViewport = useCallback(() => {
      if (!structureLoadedRef.current) return;
      try {
        const plugin = getPlugin();
        const structure = getRootStructure();
        plugin.managers.camera.focusLoci(Structure.toStructureElementLoci(structure), {
          durationMs: 0,
          extraRadius: 4,
        });
      } catch {
        // Ignore refit failures during transient layout changes.
      }
    }, [getPlugin, getRootStructure]);

    const applyScopedLociFilters = useCallback((loci: any, spec: SelectionSpec, structure: any) => {
      let scoped = loci;
      if (spec.chain) {
        scoped = StructureElement.Loci.intersect(
          scoped,
          StructureElement.Schema.toLoci(structure, { auth_asym_id: spec.chain })
        );
      }
      return scoped;
    }, []);

    const resolveNamedSelection = useCallback(async (spec: SelectionSpec, structure: any) => {
      if (spec.kind === 'protein') {
        const loci = StructureSelection.toLociWithSourceUnits(
          await StructureSelectionQueries.protein.getSelection(getPlugin(), undefined as any, structure)
        );
        return applyScopedLociFilters(loci, spec, structure);
      }
      if (spec.kind === 'ligand') {
        const loci = StructureSelection.toLociWithSourceUnits(
          await StructureSelectionQueries.ligand.getSelection(getPlugin(), undefined as any, structure)
        );
        return applyScopedLociFilters(loci, spec, structure);
      }
      if (spec.kind === 'water') {
        const loci = StructureSelection.toLociWithSourceUnits(
          await StructureSelectionQueries.water.getSelection(getPlugin(), undefined as any, structure)
        );
        return applyScopedLociFilters(loci, spec, structure);
      }
      return null;
    }, [applyScopedLociFilters, getPlugin]);

    const resolveSelection = useCallback(async (spec: SelectionSpec): Promise<SelectionResolution> => {
      const structure = getRootStructure();

      if (spec.kind === 'active_selection') {
        if (!activeSelectionsRef.current.length) {
          return {
            loci: StructureElement.Loci.none(structure),
            error: 'No active selection. Select one or more residues in the viewer first.',
          };
        }

        let combined = StructureElement.Loci.none(structure);
        for (const selected of activeSelectionsRef.current) {
          const resolved = await resolveSelection(selected);
          if (!StructureElement.Loci.is(resolved.loci) || StructureElement.Loci.isEmpty(resolved.loci)) {
            continue;
          }
          combined = StructureElement.Loci.isEmpty(combined)
            ? resolved.loci
            : StructureElement.Loci.union(combined, resolved.loci);
        }

        if (!StructureElement.Loci.is(combined) || StructureElement.Loci.isEmpty(combined)) {
          return {
            loci: StructureElement.Loci.none(structure),
            error: 'No active selection. Select one or more residues in the viewer first.',
          };
        }

        return { loci: combined };
      }

      if (spec.kind === 'current_selection') {
        if (!currentSelectionLociRef.current || !currentSelectionRef.current) {
          return {
            loci: StructureElement.Loci.none(structure),
            error: 'No current selection. Click a residue in the viewer first.',
          };
        }
        return { loci: currentSelectionLociRef.current };
      }

      if (spec.kind === 'selection_set') {
        const items = Array.isArray(spec.items) ? spec.items : [];
        if (!items.length) {
          return {
            loci: StructureElement.Loci.none(structure),
            error: 'Saved selection set is empty.',
          };
        }

        let combined = StructureElement.Loci.none(structure);
        for (const item of items) {
          const resolved = await resolveSelection(item);
          if (!StructureElement.Loci.is(resolved.loci) || StructureElement.Loci.isEmpty(resolved.loci)) {
            continue;
          }
          combined = StructureElement.Loci.isEmpty(combined)
            ? resolved.loci
            : StructureElement.Loci.union(combined, resolved.loci);
        }

        if (!StructureElement.Loci.is(combined) || StructureElement.Loci.isEmpty(combined)) {
          return {
            loci: StructureElement.Loci.none(structure),
            error: 'No atoms match the saved selection set.',
          };
        }

        return { loci: combined };
      }

      if (spec.kind === 'object') {
        if (!objectMatchesCurrent(spec.object)) {
          return {
            loci: StructureElement.Loci.none(structure),
            error: `Object "${spec.object}" is not loaded in the viewer.`,
          };
        }
        return { loci: Structure.toStructureElementLoci(structure) };
      }

      if (spec.object && !objectMatchesCurrent(spec.object)) {
        return {
          loci: StructureElement.Loci.none(structure),
          error: `Object "${spec.object}" is not loaded in the viewer.`,
        };
      }

      if (spec.kind === 'all') {
        return { loci: Structure.toStructureElementLoci(structure) };
      }

      const named = await resolveNamedSelection(spec, structure);
      if (named) {
        return { loci: named };
      }

      const schema = selectionSchema(spec);
      if (!schema) {
        return {
          loci: StructureElement.Loci.none(structure),
          error: `Unsupported selection kind: ${spec.kind}`,
        };
      }

      return { loci: StructureElement.Schema.toLoci(structure, schema) };
    }, [getRootStructure, objectMatchesCurrent, resolveNamedSelection]);

    const requireSelectionLoci = useCallback(async (spec: SelectionSpec) => {
      const { loci, error } = await resolveSelection(spec);
      if (error) throw new Error(error);
      if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
        throw new Error(`No atoms match ${describeSelection(spec)}.`);
      }
      return loci;
    }, [resolveSelection]);

    const resolveSelectionSilently = useCallback(async (spec: SelectionSpec) => {
      const { loci } = await resolveSelection(spec);
      if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
        return null;
      }
      return loci;
    }, [resolveSelection]);

    const createSingleAtomLoci = useCallback((location: any) => {
      const index = SortedArray.indexOf(location.unit.elements, location.element);
      if (index < 0) {
        throw new Error('Failed to resolve an atom in the current selection.');
      }
      return StructureElement.Loci(location.structure, [
        { unit: location.unit, indices: OrderedSet.ofSingleton(index as any) as any },
      ]);
    }, []);

    const createComponentForLoci = useCallback(async (loci: any, label: string) => {
      const plugin = getPlugin();
      const loaded = getLoadedStructure();
      const bundle = StructureElement.Bundle.fromLoci(loci);
      const key = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const selector = await plugin.builders.structure.tryCreateComponent(
        loaded.cell,
        {
          type: { name: 'bundle', params: bundle },
          nullIfEmpty: true,
          label,
        } as any,
        `nexmol-${key || 'selection'}`
      );

      if (!selector) {
        throw new Error(`No atoms match ${label}.`);
      }

      const component = getAllComponents().find(
        (item: any) => item?.cell?.transform?.ref === selector.ref
      );
      if (!component) {
        throw new Error(`Failed to register ${label} as a managed viewer component.`);
      }

      return component as any;
    }, [getAllComponents, getLoadedStructure, getPlugin]);

    const addRepresentationToComponent = useCallback(async (component: any, representation: string) => {
      const plugin = getPlugin();
      const representationType = representationToMolstarType(representation);
      const options = (plugin.managers.structure.component as any).state?.options || {};
      const hydrogens = options.hydrogens || 'only-polar';
      const typeParams: Record<string, any> = {
        ignoreHydrogens: hydrogens !== 'all',
        ignoreHydrogensVariant: hydrogens === 'only-polar' ? 'non-polar' : 'all',
        quality: options.visualQuality || 'auto',
        ignoreLight: options.ignoreLight ?? false,
        material: options.materialStyle,
        clip: options.clipObjects,
      };

      if (isSurfaceRepresentation(representation)) {
        typeParams.visuals = surfaceVisualsForRepresentation(representation);
      }

      await plugin.builders.structure.representation.addRepresentation(component.cell, {
        type: representationType,
        typeParams,
      } as any, {
        tag: representationTag(representation),
      });
    }, [getPlugin]);

    const getMatchingRepresentationsOnComponent = useCallback((component: any, representation: string) => {
      const representations = Array.isArray(component?.representations) ? component.representations : [];
      const targetType = representationToMolstarType(representation);
      const targetTag = representationTag(representation);

      return representations.filter((item: any) => {
        if (item?.cell?.transform?.params?.type?.name !== targetType) {
          return false;
        }
        if (!isSurfaceRepresentation(representation)) {
          return true;
        }
        const tags = item?.cell?.transform?.tags || [];
        return Array.isArray(tags) && tags.includes(targetTag);
      });
    }, []);

    const getOverlappingMatchingRepresentations = useCallback(async (selection: SelectionSpec, representation: string) => {
      const targetLoci = await resolveSelectionSilently(selection);
      if (!targetLoci) return [];
      const root = getRootStructure();

      return getAllComponents().flatMap((component: any) => {
        const componentStructure = component?.cell?.obj?.data;
        if (!componentStructure) return [];

        const componentLoci = StructureElement.Loci.remap(
          Structure.toStructureElementLoci(componentStructure),
          root
        );
        if (!StructureElement.Loci.areIntersecting(componentLoci, targetLoci)) {
          return [];
        }

        return getMatchingRepresentationsOnComponent(component, representation);
      });
    }, [getAllComponents, getMatchingRepresentationsOnComponent, getRootStructure, resolveSelectionSilently]);

    const representationExists = useCallback(async (selection: SelectionSpec, representation: string) => {
      return (await getOverlappingMatchingRepresentations(selection, representation)).length > 0;
    }, [getOverlappingMatchingRepresentations]);

    const clearMeasurements = useCallback(async (kind: 'labels' | 'distances' | 'all' = 'all') => {
      const plugin = getPlugin();
      const measurement = plugin.managers.structure.measurement.state;
      const update = plugin.state.data.build();
      const cells = [
        ...(kind === 'all' || kind === 'labels' ? measurement.labels : []),
        ...(kind === 'all' || kind === 'distances' ? measurement.distances : []),
      ];
      for (const cell of cells) {
        update.delete(cell.transform.ref);
      }
      if (cells.length) {
        await update.commit({ doNotUpdateCurrent: true });
      }
    }, [getPlugin]);

    const applyColorOps = useCallback(async () => {
      const plugin = getPlugin();
      const structure = getRootStructure();
      const components = getAllComponents();
      if (!components.length) return;

      await clearStructureOverpaint(plugin, components);

      for (const op of colorOpsRef.current) {
        const loci = await resolveSelectionSilently(op.selection);
        if (!loci) continue;

        if (op.kind === 'solid') {
          await setStructureOverpaint(plugin, components, colorToMolstar(op.color), async () => loci);
          continue;
        }

        if (op.kind === 'chain') {
          const chainIds = new Set<string>();
          StructureElement.Loci.forEachLocation(loci, (location) => {
            const id = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location);
            if (id) chainIds.add(id);
          });

          const chains = [...chainIds].sort();
          for (let i = 0; i < chains.length; i += 1) {
            const chainLoci = StructureElement.Loci.intersect(
              loci,
              StructureElement.Schema.toLoci(structure, { auth_asym_id: chains[i] })
            );
            await setStructureOverpaint(
              plugin,
              components,
              colorToMolstar(CHAIN_COLORS[i % CHAIN_COLORS.length]),
              async () => chainLoci
            );
          }
          continue;
        }

        const elementSymbols = new Set<string>();
        StructureElement.Loci.forEachLocation(loci, (location) => {
          const symbol = String(StructureProperties.atom.type_symbol(location) || '').toUpperCase();
          if (symbol) elementSymbols.add(symbol);
        });

        for (const symbol of [...elementSymbols].sort()) {
          const elementLoci = StructureElement.Loci.intersect(
            loci,
            StructureElement.Schema.toLoci(structure, { type_symbol: symbol })
          );
          await setStructureOverpaint(
            plugin,
            components,
            colorToMolstar(ELEMENT_COLORS[symbol] || '#b0b0b0'),
            async () => elementLoci
          );
        }
      }
    }, [getAllComponents, getPlugin, getRootStructure, resolveSelectionSilently]);

    const applyTransparencyOps = useCallback(async () => {
      const plugin = getPlugin();
      const components = getAllComponents();
      if (!components.length) return;

      await clearStructureTransparency(plugin, components);
      for (const op of transparencyOpsRef.current) {
        const loci = await resolveSelectionSilently(op.selection);
        if (!loci) continue;
        await setStructureTransparency(
          plugin,
          components,
          Math.max(0, Math.min(1, op.value)),
          async () => loci,
          op.representation ? representationTypeFilter(op.representation) : undefined
        );
      }
    }, [getAllComponents, getPlugin, resolveSelectionSilently]);

    const buildResidueLabelLoci = useCallback((baseLoci: any, location: any) => {
      const chain = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location) || undefined;
      const residue = StructureProperties.atom.label_comp_id(location);
      const resi = StructureProperties.residue.auth_seq_id(location);

      if (!residue || !Number.isFinite(resi)) {
        return StructureElement.Loci.firstResidue(createSingleAtomLoci(location));
      }

      const residueLoci = StructureElement.Schema.toLoci(baseLoci.structure, {
        label_comp_id: residue,
        auth_seq_id: resi,
        ...(chain ? { auth_asym_id: chain } : {}),
      });

      const scoped = StructureElement.Loci.intersect(
        StructureElement.Loci.extendToWholeResidues(baseLoci),
        residueLoci
      );

      if (StructureElement.Loci.isEmpty(scoped)) {
        return StructureElement.Loci.firstResidue(createSingleAtomLoci(location));
      }

      return scoped;
    }, [createSingleAtomLoci]);

    const buildLabelEntityKey = useCallback((location: any, mode: string) => {
      const chain = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location) || '';
      const residue = StructureProperties.atom.label_comp_id(location) || '';
      const resi = StructureProperties.residue.auth_seq_id(location);
      const atom = StructureProperties.atom.label_atom_id(location) || '';
      if (mode === 'atom') {
        return `atom:${chain}:${residue}:${String(resi)}:${atom}`;
      }
      return `residue:${chain}:${residue}:${String(resi)}`;
    }, []);

    const collectLabelKeys = useCallback((loci: any, mode: string) => {
      const keys = new Set<string>();
      StructureElement.Loci.forEachLocation(loci, (location) => {
        keys.add(buildLabelEntityKey(location, mode));
      });
      return keys;
    }, [buildLabelEntityKey]);

    const isSingleResidueLoci = useCallback((loci: any) => {
      if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
        return false;
      }

      const residues = new Set<string>();
      StructureElement.Loci.forEachLocation(loci, (location) => {
        const chain = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location) || '';
        const residue = StructureProperties.atom.label_comp_id(location) || '';
        const resi = StructureProperties.residue.auth_seq_id(location);
        residues.add(`${chain}:${residue}:${String(resi)}`);
      });
      return residues.size === 1;
    }, []);

    const collectResidueSelectionsFromLoci = useCallback((loci: any) => {
      const selections = new Map<string, SelectionSpec>();
      if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
        return selections;
      }

      StructureElement.Loci.forEachLocation(loci, (location) => {
        const chain = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location) || undefined;
        const residue = StructureProperties.atom.label_comp_id(location) || undefined;
        const resi = StructureProperties.residue.auth_seq_id(location);
        if (!residue || !Number.isFinite(resi)) return;
        const selection: SelectionSpec = {
          kind: 'residue',
          chain,
          residue,
          resi: String(resi),
          object: currentObjectNameRef.current || undefined,
        };
        selections.set(selectionKey(selection), selection);
      });

      return selections;
    }, []);

    const getActiveResidueSelections = useCallback(() => {
      const plugin = pluginRef.current;
      const active = new Map<string, SelectionSpec>();
      if (!plugin) return active;

      plugin.managers.structure.selection.entries.forEach((entry: any) => {
        const fromEntry = collectResidueSelectionsFromLoci(entry.selection);
        fromEntry.forEach((value, key) => active.set(key, value));
      });
      return active;
    }, [collectResidueSelectionsFromLoci]);

    const reconcileSelectionState = useCallback(() => {
      const activeSelections = getActiveResidueSelections();
      if (!activeSelections.size) {
        clearSelectionState();
        return;
      }

      const nextActiveSelections = activeSelectionsRef.current
        .filter((item) => activeSelections.has(selectionKey(item)))
        .map((item) => activeSelections.get(selectionKey(item)) || item);

      activeSelections.forEach((selection, key) => {
        if (!nextActiveSelections.some((item) => selectionKey(item) === key)) {
          nextActiveSelections.push(selection);
        }
      });

      selectedPairRef.current = nextActiveSelections.slice(-2);

      if (currentSelectionRef.current && activeSelections.has(selectionKey(currentSelectionRef.current))) {
        currentSelectionRef.current = activeSelections.get(selectionKey(currentSelectionRef.current)) || currentSelectionRef.current;
      } else {
        currentSelectionRef.current =
          selectedPairRef.current[selectedPairRef.current.length - 1] ||
          nextActiveSelections[nextActiveSelections.length - 1] ||
          null;
      }

      if (currentSelectionRef.current) {
        void requireSelectionLoci(currentSelectionRef.current)
          .then((loci) => {
            currentSelectionLociRef.current = loci;
            syncSelectionState(nextActiveSelections);
          })
          .catch(() => {
            clearSelectionState();
          });
        return;
      }

      currentSelectionLociRef.current = null;
      syncSelectionState(nextActiveSelections);
    }, [clearSelectionState, getActiveResidueSelections, requireSelectionLoci, syncSelectionState]);

    const rebuildLabels = useCallback(async () => {
      await clearMeasurements('labels');
      const plugin = getPlugin();
      for (const op of labelOpsRef.current) {
        const loci = await resolveSelectionSilently(op.selection);
        if (!loci) continue;
        const seen = new Set<string>();
        const pending: Array<{ loci: any; text: string }> = [];

        StructureElement.Loci.forEachLocation(loci, (location) => {
          const chain = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location) || '';
          const residue = StructureProperties.atom.label_comp_id(location) || '';
          const resi = StructureProperties.residue.auth_seq_id(location);
          const atom = StructureProperties.atom.label_atom_id(location) || '';
          const labelKey = buildLabelEntityKey(location, op.mode);
          if (clearedLabelKeysRef.current.has(labelKey)) {
            return;
          }

          if (op.mode === 'atom') {
            const key = `${location.unit.id}:${location.element}`;
            if (seen.has(key)) return;
            seen.add(key);
            pending.push({
              loci: createSingleAtomLoci(location),
              text: atom || describeSelection(op.selection),
            });
            return;
          }

          const key = `${chain}:${residue}:${String(resi)}`;
          if (seen.has(key)) return;
          seen.add(key);
          pending.push({
            loci: buildResidueLabelLoci(loci, location),
            text: residue && Number.isFinite(resi) ? `${residue}${resi}` : describeSelection(op.selection),
          });
        });

        for (const entry of pending) {
          await plugin.managers.structure.measurement.addLabel(entry.loci, {
            visualParams: {
              customText: entry.text,
            },
          });
        }
      }
    }, [buildResidueLabelLoci, clearMeasurements, createSingleAtomLoci, getPlugin, resolveSelectionSilently]);

    const clearLabelsForSelection = useCallback(async (selection?: SelectionSpec) => {
      if (!selection) {
        labelOpsRef.current = [];
        clearedLabelKeysRef.current = new Set();
        await clearMeasurements('labels');
        return;
      }

      const targetLoci = await requireSelectionLoci(selection);
      for (const op of labelOpsRef.current) {
        for (const key of collectLabelKeys(targetLoci, op.mode)) {
          clearedLabelKeysRef.current.add(key);
        }
      }
      await rebuildLabels();
    }, [clearMeasurements, collectLabelKeys, rebuildLabels, requireSelectionLoci]);

    const chooseAnchorLocation = useCallback((spec: SelectionSpec, loci: any) => {
      if (spec.kind === 'atom') {
        return StructureElement.Loci.getFirstLocation(StructureElement.Loci.firstElement(loci));
      }

      const candidates: AnchorCandidate[] = [];
      const byResidue = new Map<string, AnchorCandidate>();

      StructureElement.Loci.forEachLocation(loci, (location) => {
        const chain = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location) || '';
        const residue = StructureProperties.atom.label_comp_id(location) || '';
        const resi = StructureProperties.residue.auth_seq_id(location);
        const key = `${chain}:${residue}:${String(resi)}`;
        let entry = byResidue.get(key);
        if (!entry) {
          entry = { key, first: StructureElement.Location.clone(location) };
          byResidue.set(key, entry);
          candidates.push(entry);
        }

        const atomName = String(StructureProperties.atom.label_atom_id(location) || '').toUpperCase();
        const elementSymbol = String(StructureProperties.atom.type_symbol(location) || '').toUpperCase();
        if (atomName === 'CA' && !entry.ca) entry.ca = StructureElement.Location.clone(location);
        if (atomName === 'P' && !entry.p) entry.p = StructureElement.Location.clone(location);
        if (elementSymbol !== 'H' && !entry.heavy) entry.heavy = StructureElement.Location.clone(location);
      });

      const entry = candidates[0];
      if (!entry) {
        return StructureElement.Loci.getFirstLocation(StructureElement.Loci.firstElement(loci));
      }
      return entry.ca || entry.p || entry.heavy || entry.first;
    }, []);

    const isExpandableMeasurementSelection = useCallback((spec: SelectionSpec) => {
      return spec.kind === 'residue' && spec.allMatches === true && !spec.resi;
    }, []);

    const expandMeasurementSelections = useCallback(async (spec: SelectionSpec) => {
      if (!isExpandableMeasurementSelection(spec)) {
        return [spec];
      }

      const loci = await requireSelectionLoci(spec);
      const selections = new Map<string, SelectionSpec>();
      StructureElement.Loci.forEachLocation(loci, (location) => {
        const residue = StructureProperties.atom.label_comp_id(location) || '';
        const resi = StructureProperties.residue.auth_seq_id(location);
        if (!residue || !Number.isFinite(resi)) {
          return;
        }
        const chain = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location) || undefined;
        const selection: SelectionSpec = {
          kind: 'residue',
          residue,
          resi: String(resi),
          ...(chain ? { chain } : {}),
          ...(spec.object ? { object: spec.object } : {}),
        };
        selections.set(selectionKey(selection), selection);
      });

      return [...selections.values()];
    }, [isExpandableMeasurementSelection, requireSelectionLoci]);

    const resolveAnchorLoci = useCallback(async (spec: SelectionSpec) => {
      const loci = await requireSelectionLoci(spec);
      const location = chooseAnchorLocation(spec, loci);
      if (!location) {
        throw new Error(`No anchor atom could be resolved for ${describeSelection(spec)}.`);
      }
      return createSingleAtomLoci(location);
    }, [chooseAnchorLocation, createSingleAtomLoci, requireSelectionLoci]);

    const rebuildDistances = useCallback(async () => {
      await clearMeasurements('distances');
      const plugin = getPlugin();
      for (const op of distanceOpsRef.current) {
        const sourceLoci = await resolveSelectionSilently(op.source);
        const targetLoci = await resolveSelectionSilently(op.target);
        if (!sourceLoci || !targetLoci) continue;
        const sourceAnchor = chooseAnchorLocation(op.source, sourceLoci);
        const targetAnchor = chooseAnchorLocation(op.target, targetLoci);
        if (!sourceAnchor || !targetAnchor || StructureElement.Location.areEqual(sourceAnchor, targetAnchor)) {
          continue;
        }
        await plugin.managers.structure.measurement.addDistance(
          createSingleAtomLoci(sourceAnchor),
          createSingleAtomLoci(targetAnchor)
        );
      }
    }, [chooseAnchorLocation, clearMeasurements, createSingleAtomLoci, getPlugin, resolveSelectionSilently]);

    const reapplySceneDecorations = useCallback(async () => {
      await applyColorOps();
      await applyTransparencyOps();
      await rebuildLabels();
      await rebuildDistances();
    }, [applyColorOps, applyTransparencyOps, rebuildDistances, rebuildLabels]);

    const extractSelectionSpec = useCallback((loci: any): SelectionSpec | null => {
      if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
        return null;
      }

      const residueLoci = StructureElement.Loci.firstResidue(loci);
      const location = StructureElement.Loci.getFirstLocation(residueLoci);
      if (!location) return null;

      const chain = StructureProperties.chain.auth_asym_id(location) || StructureProperties.chain.label_asym_id(location) || undefined;
      const residue = StructureProperties.atom.label_comp_id(location) || undefined;
      const resi = StructureProperties.residue.auth_seq_id(location);

      if (residue && Number.isFinite(resi)) {
        return {
          kind: 'residue',
          chain,
          residue,
          resi: String(resi),
          object: currentObjectNameRef.current || undefined,
        };
      }

      if (chain) {
        return {
          kind: 'chain',
          chain,
          object: currentObjectNameRef.current || undefined,
        };
      }

      return {
        kind: 'current_selection',
        object: currentObjectNameRef.current || undefined,
      };
    }, []);

    useEffect(() => {
      let disposed = false;

      const init = async () => {
        if (!containerRef.current || pluginRef.current) return;

        try {
          const plugin = await createPluginUI({
            target: containerRef.current,
            render: renderReact18,
            spec: {
              ...DefaultPluginUISpec(),
              layout: {
                initial: {
                  isExpanded: false,
                  showControls: false,
                },
              },
              components: {
                remoteState: 'none',
              },
            },
          });

          if (disposed) {
            plugin.dispose();
            return;
          }

          pluginRef.current = plugin;
          plugin.selectionMode = true;

          plugin.behaviors.interaction.click.subscribe(({ current }: any) => {
            const loci = current?.loci;
            if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
              clearSelectionState();
              return;
            }

            const residueLoci = StructureElement.Loci.firstResidue(loci);
            if (!isSingleResidueLoci(residueLoci)) {
              return;
            }
            currentSelectionLociRef.current = residueLoci;
            currentSelectionRef.current = extractSelectionSpec(residueLoci);
          });

          plugin.managers.structure.selection.events.changed.subscribe(() => {
            reconcileSelectionState();
          });

          plugin.managers.structure.selection.events.loci.clear.subscribe(() => {
            clearSelectionState();
          });

          await PluginCommands.Canvas3D.SetSettings(plugin, {
            settings: (props) => ({
              renderer: {
                ...props.renderer,
                backgroundColor: colorToMolstar(DEFAULT_BACKGROUND),
              },
            }) as any,
          });
          backgroundColorRef.current = DEFAULT_BACKGROUND;
          applyViewerBackgroundCss(DEFAULT_BACKGROUND);
          setViewerReady(true);
        } catch (error) {
          pluginRef.current = null;
          setViewerReady(false);
          console.error('Failed to initialize Mol* viewer.', error);
        }
      };

      void init();

      return () => {
        disposed = true;
        setViewerReady(false);
        setViewerExpanded(false);
        pluginRef.current?.dispose();
        pluginRef.current = null;
      };
    }, [applyViewerBackgroundCss, clearSelectionState, extractSelectionSpec, isSingleResidueLoci, reconcileSelectionState, setViewerExpanded, setViewerReady, syncSelectionState]);

    useEffect(() => {
      const host = containerRef.current;
      if (!host || typeof MutationObserver === 'undefined') return;

      const syncExpandedState = () => {
        const expanded = Boolean(host.querySelector('.msp-layout-expanded, .msp-viewport-expanded'));
        setViewerExpanded(expanded);
      };

      syncExpandedState();

      const observer = new MutationObserver(() => {
        syncExpandedState();
      });

      observer.observe(host, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
      });

      return () => {
        observer.disconnect();
        setViewerExpanded(false);
      };
    }, [setViewerExpanded]);

    useEffect(() => {
      if (!viewerReady || !containerRef.current || typeof ResizeObserver === 'undefined') return;

      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          pluginRef.current?.canvas3d?.requestResize();
        });
      });

      observer.observe(containerRef.current);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      };
    }, [viewerReady]);

    useEffect(() => {
      if (!viewerReady) {
        previousSequenceUiOpenRef.current = sequenceUiOpen;
        return;
      }

      const changed = previousSequenceUiOpenRef.current !== sequenceUiOpen;
      previousSequenceUiOpenRef.current = sequenceUiOpen;
      if (!changed) return;

      let frame1 = 0;
      let frame2 = 0;
      let timeoutId: number | undefined;
      frame1 = requestAnimationFrame(() => {
        pluginRef.current?.canvas3d?.requestResize();
        frame2 = requestAnimationFrame(() => {
          pluginRef.current?.canvas3d?.requestResize();
        });
      });

      timeoutId = window.setTimeout(() => {
        pluginRef.current?.canvas3d?.requestResize();
        refitStructureIntoViewport();
      }, 320);

      return () => {
        cancelAnimationFrame(frame1);
        cancelAnimationFrame(frame2);
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      };
    }, [refitStructureIntoViewport, sequenceUiOpen, viewerReady]);

    useImperativeHandle(ref, () => ({
      loadStructure(data: string, format: string, options?: { objectName?: string }) {
        return enqueue(async () => {
          const plugin = getPlugin();
          await plugin.clear();
          structureLoadedRef.current = false;
          setHasStructure(false);
          clearSelectionState();
          resetSceneOps();

          const raw = await plugin.builders.data.rawData({
            data,
            label: options?.objectName || 'structure',
          });
          const trajectory = await plugin.builders.structure.parseTrajectory(raw, normalizeFormat(format) as any);
          await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
            representationPreset: 'auto',
            showUnitcell: false,
          });

          structureLoadedRef.current = true;
          setHasStructure(true);
          currentObjectNameRef.current = options?.objectName?.trim() || 'structure';
          lastStructureRef.current = {
            data,
            format,
            objectName: currentObjectNameRef.current,
          };

          await reapplySceneDecorations();
        });
      },

      showRepresentation(selection: SelectionSpec, representation: string) {
        return enqueue(async () => {
          if (isSurfaceRepresentation(representation)) {
            const allowedKinds = new Set(['protein', 'ligand', 'residue', 'chain', 'all', 'object', 'current_selection', 'active_selection', 'selection_set']);
            if (!allowedKinds.has(selection.kind)) {
              throw new Error(`Surface is currently supported for protein, ligand, residue, chain, object, or the full structure. "${describeSelection(selection)}" is not supported.`);
            }
          }
          const loci = await requireSelectionLoci(selection);
          const component = await createComponentForLoci(loci, describeSelection(selection));
          if (getMatchingRepresentationsOnComponent(component, representation).length === 0) {
            await addRepresentationToComponent(component, representation);
          }
          await reapplySceneDecorations();
        });
      },

      hideRepresentation(selection: SelectionSpec, representation: string) {
        return enqueue(async () => {
          const plugin = getPlugin();
          const loci = await requireSelectionLoci(selection);
          const component = await createComponentForLoci(loci, describeSelection(selection));
          const representationType = (representation || '').trim();

          if (!representationType || representationType === 'everything' || representationType === 'all') {
            await plugin.managers.structure.component.removeRepresentations([component]);
            return;
          }

          const matching = getMatchingRepresentationsOnComponent(component, representationType);
          if (!matching.length) {
            throw new Error(`No ${representationType} representation is active for ${describeSelection(selection)}.`);
          }
          await plugin.managers.structure.hierarchy.remove(matching, true);
          await reapplySceneDecorations();
        });
      },

      isolateSelection(selection: SelectionSpec, representation?: string) {
        return enqueue(async () => {
          const plugin = getPlugin();
          const structures = plugin.managers.structure.hierarchy.current.structures;
          const loci = await requireSelectionLoci(selection);
          await plugin.managers.structure.component.clear(structures);
          const component = await createComponentForLoci(loci, describeSelection(selection));
          await plugin.managers.structure.component.addRepresentation([component], representationToMolstarType(representation || defaultRepresentationForKind(selection.kind)));
          plugin.managers.camera.focusLoci(loci);
          await reapplySceneDecorations();
        });
      },

      removeSelection(selection: SelectionSpec) {
        return enqueue(async () => {
          await requireSelectionLoci(selection);
          const key = `remove:${selectionKey(selection)}`;
          transparencyOpsRef.current = [
            ...transparencyOpsRef.current.filter((op) => op.key !== key),
            { key, selection, value: 1 },
          ];
          await applyTransparencyOps();

          if (selection.kind === 'current_selection' || selection.kind === 'active_selection') {
            clearSelectionState();
          }
        });
      },

      colorSelection(selection: SelectionSpec, color: string) {
        return enqueue(async () => {
          await requireSelectionLoci(selection);
          const targetKey = selectionKey(selection);
          colorOpsRef.current = [
            ...colorOpsRef.current.filter((op) => !op.key.startsWith(`color:${targetKey}:`)),
            { kind: 'solid', key: `color:${targetKey}:solid`, selection, color },
          ];
          await applyColorOps();
        });
      },

      colorByChain(selection: SelectionSpec) {
        return enqueue(async () => {
          await requireSelectionLoci(selection);
          const targetKey = selectionKey(selection);
          colorOpsRef.current = [
            ...colorOpsRef.current.filter((op) => !op.key.startsWith(`color:${targetKey}:`)),
            { kind: 'chain', key: `color:${targetKey}:chain`, selection },
          ];
          await applyColorOps();
        });
      },

      colorByElement(selection: SelectionSpec) {
        return enqueue(async () => {
          await requireSelectionLoci(selection);
          const targetKey = selectionKey(selection);
          colorOpsRef.current = [
            ...colorOpsRef.current.filter((op) => !op.key.startsWith(`color:${targetKey}:`)),
            { kind: 'element', key: `color:${targetKey}:element`, selection },
          ];
          await applyColorOps();
        });
      },

      setTransparency(selection: SelectionSpec, value: number, representation: string) {
        return enqueue(async () => {
          await requireSelectionLoci(selection);
          const targetRepresentation = representation || 'surface';
          if (!(await representationExists(selection, targetRepresentation))) {
            throw new Error(`No active ${targetRepresentation} representation is available to fade yet.`);
          }
          const key = `transparency:${selectionKey(selection)}:${representation || 'surface'}`;
          transparencyOpsRef.current = [
            ...transparencyOpsRef.current.filter((op) => op.key !== key),
            {
              key,
              selection,
              value: Math.max(0, Math.min(1, value)),
              representation: targetRepresentation,
            },
          ];
          await applyTransparencyOps();
        });
      },

      labelSelection(selection: SelectionSpec, mode: string) {
        return enqueue(async () => {
          const loci = await requireSelectionLoci(selection);
          for (const key of collectLabelKeys(loci, mode)) {
            clearedLabelKeysRef.current.delete(key);
          }
          const key = `label:${selectionKey(selection)}:${mode}`;
          labelOpsRef.current = [
            ...labelOpsRef.current.filter((op) => op.key !== key),
            { key, selection, mode },
          ];
          await rebuildLabels();
        });
      },

      clearLabels(selection?: SelectionSpec) {
        return enqueue(async () => {
          await clearLabelsForSelection(selection);
        });
      },

      zoomTo(selection: SelectionSpec) {
        return enqueue(async () => {
          const plugin = getPlugin();
          const loci = await requireSelectionLoci(selection);
          plugin.managers.camera.focusLoci(loci);
        });
      },

      orientSelection(selection: SelectionSpec) {
        return enqueue(async () => {
          const plugin = getPlugin();
          const loci = await requireSelectionLoci(selection);
          plugin.managers.camera.focusLoci(loci, { durationMs: 250, extraRadius: 4 });
          plugin.managers.camera.orientAxes([StructureElement.Loci.toStructure(loci)], 250);
        });
      },

      measureDistance(source: SelectionSpec, target: SelectionSpec) {
        return enqueue(async () => {
          let resolvedSource = source;
          let resolvedTarget = target;
          const selectedPairMode = source.kind === 'current_selection' && target.kind === 'current_selection';
          if (source.kind === 'current_selection' && target.kind === 'current_selection') {
            if (selectedPairRef.current.length < 2) {
              throw new Error('Click two residues in the viewer first, then run measure distance between selected.');
            }
            [resolvedSource, resolvedTarget] = selectedPairRef.current;
          }

          const sourcePlural = isExpandableMeasurementSelection(resolvedSource);
          const targetPlural = isExpandableMeasurementSelection(resolvedTarget);
          if (sourcePlural && targetPlural) {
            throw new Error('Measuring between two plural targets is not supported yet. Narrow one side first.');
          }

          const sources = await expandMeasurementSelections(resolvedSource);
          const targets = await expandMeasurementSelections(resolvedTarget);
          const nextOps = new Map(distanceOpsRef.current.map((op) => [op.key, op] as const));
          let created = 0;

          for (const expandedSource of sources) {
            for (const expandedTarget of targets) {
              const sourceAnchor = await resolveAnchorLoci(expandedSource);
              const targetAnchor = await resolveAnchorLoci(expandedTarget);
              const sourceLocation = StructureElement.Loci.getFirstLocation(sourceAnchor);
              const targetLocation = StructureElement.Loci.getFirstLocation(targetAnchor);
              if (sourceLocation && targetLocation && StructureElement.Location.areEqual(sourceLocation, targetLocation)) {
                continue;
              }
              const key = distanceOperationKey(expandedSource, expandedTarget);
              nextOps.set(key, {
                key,
                source: expandedSource,
                target: expandedTarget,
                mode: selectedPairMode ? 'selected_pair' : 'explicit',
              });
              created += 1;
            }
          }

          if (!created) {
            throw new Error('Source and target resolved to the same atom. Pick two different atoms or residues.');
          }

          distanceOpsRef.current = [...nextOps.values()];
          await rebuildDistances();
        });
      },

      clearDistanceMeasurements() {
        return enqueue(async () => {
          distanceOpsRef.current = [];
          await clearMeasurements('distances');
        });
      },

      setBackground(color: string) {
        return enqueue(async () => {
          const plugin = getPlugin();
          await PluginCommands.Canvas3D.SetSettings(plugin, {
            settings: (props) => ({
              renderer: {
                ...props.renderer,
              backgroundColor: colorToMolstar(color),
            },
          }) as any,
          });
          backgroundColorRef.current = color;
          applyViewerBackgroundCss(color);
        });
      },

      rotateView(axis: string, angle: number) {
        return enqueue(async () => {
          const plugin = getPlugin();
          if (!plugin.canvas3d) throw new Error('Viewer canvas is not ready yet.');

          const normalizedAxis = axis.trim().toUpperCase();
          const radians = (angle * Math.PI) / 180;
          const axisVector = normalizedAxis === 'X'
            ? Vec3.create(1, 0, 0)
            : normalizedAxis === 'Y'
              ? Vec3.create(0, 1, 0)
              : Vec3.create(0, 0, 1);
          const rotation4 = Mat4.fromRotation(Mat4.identity(), radians, axisVector);
          const rotation3 = Mat3.fromMat4(Mat3.identity(), rotation4);
          const snapshot = changeCameraRotation(plugin.canvas3d.camera.getSnapshot(), rotation3);
          plugin.managers.camera.setSnapshot(snapshot, 250);
        });
      },

      snapshot() {
        return enqueue(async () => {
          const plugin = getPlugin();
          return (await plugin.helpers.viewportScreenshot?.getImageDataUri()) || null;
        });
      },

      clear() {
        return enqueue(async () => {
          const plugin = getPlugin();
          await plugin.clear();
          structureLoadedRef.current = false;
          setHasStructure(false);
          currentObjectNameRef.current = null;
          lastStructureRef.current = null;
          clearSelectionState();
          resetSceneOps();
        });
      },

      hasStructure() {
        return structureLoadedRef.current;
      },

      hasCurrentSelection() {
        return !!currentSelectionRef.current;
      },

      getCurrentSelection() {
        return currentSelectionRef.current;
      },

      getCurrentObjectName() {
        return currentObjectNameRef.current;
      },

      getSceneSnapshot() {
        return enqueue(async () => {
          return {
            backgroundColor: backgroundColorRef.current,
          };
        });
      },

      applySceneSnapshot(snapshot) {
        return enqueue(async () => {
          const plugin = getPlugin();
          if (snapshot?.backgroundColor) {
            await PluginCommands.Canvas3D.SetSettings(plugin, {
              settings: (props) => ({
                renderer: {
                  ...props.renderer,
                  backgroundColor: colorToMolstar(snapshot.backgroundColor || DEFAULT_BACKGROUND),
                },
              }) as any,
            });
            backgroundColorRef.current = snapshot.backgroundColor;
            applyViewerBackgroundCss(snapshot.backgroundColor);
          }
        });
      },
    }), [
      applyColorOps,
      applyTransparencyOps,
      clearMeasurements,
      clearLabelsForSelection,
      clearSelectionState,
      createComponentForLoci,
      enqueue,
      expandMeasurementSelections,
      extractSelectionSpec,
      getAllComponents,
      getLoadedStructure,
      getPlugin,
      getRootStructure,
      isExpandableMeasurementSelection,
      objectMatchesCurrent,
      rebuildDistances,
      rebuildLabels,
      reapplySceneDecorations,
      representationExists,
      requireSelectionLoci,
      resolveAnchorLoci,
      resetSceneOps,
      refitStructureIntoViewport,
      syncSelectionState,
      applyViewerBackgroundCss,
    ]);

    return (
      <div className={className} style={{ position: 'relative', minHeight: 0, minWidth: 0, display: 'flex' }}>
        <div className="relative min-w-0 flex-[1_1_0%] overflow-hidden" style={{ background: 'var(--nexmol-viewer-bg, #111111)' }}>
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ background: 'var(--nexmol-viewer-bg, #111111)' }}
          />
          <div
            aria-hidden={hasStructure}
            className={`nexmol-viewer-empty-state ${hasStructure ? 'is-hidden' : ''}`}
          >
            <div className="nexmol-viewer-empty-state-brand">
              <div
                className="nexmol-viewer-empty-state-mark"
                style={{ ['--nexmol-mark-mask' as any]: `url(${nexmolViewerMark})` }}
              >
                <span className="nexmol-viewer-empty-state-mark-layer nexmol-viewer-empty-state-mark-under" />
                <span className="nexmol-viewer-empty-state-mark-layer nexmol-viewer-empty-state-mark-core" />
              </div>
              <span className="nexmol-viewer-empty-state-wordmark">NexMol</span>
            </div>
          </div>
        </div>
        {pluginRef.current && (
          <SequencePanel
            plugin={pluginRef.current}
            mode={sequenceUiMode}
            open={sequenceUiOpen}
            width={sequenceUiWidth}
            onWidthChange={setSequenceUiWidth}
          />
        )}
      </div>
    );
  }
);

export default MoleculeViewer;
