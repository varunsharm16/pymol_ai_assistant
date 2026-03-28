import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Color } from 'molstar/lib/mol-util/color';
import { Mat3, Mat4, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
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

export type SelectionSpec = {
  kind: string;
  chain?: string;
  residue?: string;
  resi?: string;
  atom?: string;
  object?: string;
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
  zoomTo: (selection: SelectionSpec) => Promise<void>;
  orientSelection: (selection: SelectionSpec) => Promise<void>;
  measureDistance: (source: SelectionSpec, target: SelectionSpec) => Promise<void>;
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
};

function describeSelection(spec: SelectionSpec): string {
  const kind = spec.kind;
  if (kind === 'all') return 'everything';
  if (kind === 'protein') return 'protein';
  if (kind === 'ligand') return 'ligand';
  if (kind === 'water') return 'waters';
  if (kind === 'metals') return 'metals';
  if (kind === 'hydrogens') return 'hydrogens';
  if (kind === 'current_selection') return 'current selection';
  if (kind === 'chain') return `chain ${spec.chain}`;
  if (kind === 'residue') return `residue ${spec.residue}${spec.resi ? ` ${spec.resi}` : ''}${spec.chain ? ` in chain ${spec.chain}` : ''}`;
  if (kind === 'atom') return `atom ${spec.atom}${spec.residue ? ` in ${spec.residue}` : ''}${spec.resi ? ` ${spec.resi}` : ''}${spec.chain ? ` chain ${spec.chain}` : ''}`;
  if (kind === 'object') return `object ${spec.object}`;
  return kind;
}

function selectionKey(spec: SelectionSpec): string {
  return JSON.stringify(spec);
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
    return { items: { type_symbol: METAL_ELEMENTS } };
  }
  if (spec.kind === 'hydrogens') {
    return { type_symbol: 'H' };
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
    const containerRef = useRef<HTMLDivElement>(null);
    const pluginRef = useRef<PluginUIContext | null>(null);
    const structureLoadedRef = useRef(false);
    const currentSelectionRef = useRef<SelectionSpec | null>(null);
    const currentSelectionLociRef = useRef<any | null>(null);
    const currentObjectNameRef = useRef<string | null>(null);
    const queueRef = useRef<Promise<unknown>>(Promise.resolve());
    const lastStructureRef = useRef<StoredStructure | null>(null);
    const backgroundColorRef = useRef(DEFAULT_BACKGROUND);
    const colorOpsRef = useRef<ColorOperation[]>([]);
    const transparencyOpsRef = useRef<TransparencyOperation[]>([]);
    const labelOpsRef = useRef<LabelOperation[]>([]);
    const distanceOpsRef = useRef<DistanceOperation[]>([]);

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

    const clearSelectionState = useCallback(() => {
      currentSelectionRef.current = null;
      currentSelectionLociRef.current = null;
    }, []);

    const resetSceneOps = useCallback(() => {
      colorOpsRef.current = [];
      transparencyOpsRef.current = [];
      labelOpsRef.current = [];
      distanceOpsRef.current = [];
    }, []);

    const resolveNamedSelection = useCallback(async (spec: SelectionSpec, structure: any) => {
      if (spec.kind === 'protein') {
        return StructureSelection.toLociWithSourceUnits(
          await StructureSelectionQueries.protein.getSelection(getPlugin(), undefined as any, structure)
        );
      }
      if (spec.kind === 'ligand') {
        return StructureSelection.toLociWithSourceUnits(
          await StructureSelectionQueries.ligand.getSelection(getPlugin(), undefined as any, structure)
        );
      }
      if (spec.kind === 'water') {
        return StructureSelection.toLociWithSourceUnits(
          await StructureSelectionQueries.water.getSelection(getPlugin(), undefined as any, structure)
        );
      }
      return null;
    }, [getPlugin]);

    const resolveSelection = useCallback(async (spec: SelectionSpec): Promise<SelectionResolution> => {
      const structure = getRootStructure();

      if (spec.kind === 'current_selection') {
        if (!currentSelectionLociRef.current || !currentSelectionRef.current) {
          return {
            loci: StructureElement.Loci.none(structure),
            error: 'No current selection. Click a residue in the viewer first.',
          };
        }
        return { loci: currentSelectionLociRef.current };
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

    const createComponentForLoci = useCallback(async (loci: any, label: string) => {
      const plugin = getPlugin();
      const loaded = getLoadedStructure();
      const bundle = StructureElement.Bundle.fromLoci(loci);
      const key = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const component = await plugin.builders.structure.tryCreateComponent(
        loaded.cell,
        {
          type: { name: 'bundle', params: bundle },
          nullIfEmpty: true,
          label,
        } as any,
        `nexmol-${key || 'selection'}`
      );

      if (!component) {
        throw new Error(`No atoms match ${label}.`);
      }
      return component as any;
    }, [getLoadedStructure, getPlugin]);

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

    const rebuildLabels = useCallback(async () => {
      await clearMeasurements('labels');
      const plugin = getPlugin();
      for (const op of labelOpsRef.current) {
        const loci = await resolveSelectionSilently(op.selection);
        if (!loci) continue;

        const firstLocation = StructureElement.Loci.getFirstLocation(loci);
        let customText = describeSelection(op.selection);
        if (firstLocation) {
          const atom = StructureProperties.atom.label_atom_id(firstLocation);
          const residue = StructureProperties.atom.label_comp_id(firstLocation);
          const resi = StructureProperties.residue.auth_seq_id(firstLocation);
          customText = op.mode === 'atom' && atom
            ? atom
            : residue && Number.isFinite(resi)
              ? `${residue}${resi}`
              : describeSelection(op.selection);
        }

        await plugin.managers.structure.measurement.addLabel(loci, {
          visualParams: {
            customText,
          },
        });
      }
    }, [clearMeasurements, getPlugin, resolveSelectionSilently]);

    const rebuildDistances = useCallback(async () => {
      await clearMeasurements('distances');
      const plugin = getPlugin();
      for (const op of distanceOpsRef.current) {
        const sourceLoci = await resolveSelectionSilently(op.source);
        const targetLoci = await resolveSelectionSilently(op.target);
        if (!sourceLoci || !targetLoci) continue;
        await plugin.managers.structure.measurement.addDistance(sourceLoci, targetLoci);
      }
    }, [clearMeasurements, getPlugin, resolveSelectionSilently]);

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
      const atom = StructureProperties.atom.label_atom_id(location) || undefined;

      if (residue && Number.isFinite(resi)) {
        return {
          kind: 'residue',
          chain,
          residue,
          resi: String(resi),
          atom,
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
            return;
          }

          const residueLoci = StructureElement.Loci.firstResidue(loci);
          currentSelectionLociRef.current = residueLoci;
          currentSelectionRef.current = extractSelectionSpec(residueLoci);
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
      };

      void init();

      return () => {
        disposed = true;
        pluginRef.current?.dispose();
        pluginRef.current = null;
      };
    }, [extractSelectionSpec]);

    useImperativeHandle(ref, () => ({
      loadStructure(data: string, format: string, options?: { objectName?: string }) {
        return enqueue(async () => {
          const plugin = getPlugin();
          await plugin.clear();
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
          const plugin = getPlugin();
          const loci = await requireSelectionLoci(selection);
          const component = await createComponentForLoci(loci, describeSelection(selection));
          await plugin.managers.structure.component.removeRepresentations([component]);
          await plugin.managers.structure.component.addRepresentation([component], representationToMolstarType(representation));
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

          const targetType = representationToMolstarType(representationType);
          const repr = component.representations.find((item: any) => item.cell.transform.params?.type?.name === targetType);
          if (!repr) {
            throw new Error(`No ${representationType} representation is active for ${describeSelection(selection)}.`);
          }
          await plugin.managers.structure.component.removeRepresentations([component], repr);
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

          if (currentSelectionRef.current?.kind === 'current_selection' || selection.kind === 'current_selection') {
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
          const key = `transparency:${selectionKey(selection)}:${representation || 'surface'}`;
          transparencyOpsRef.current = [
            ...transparencyOpsRef.current.filter((op) => op.key !== key),
            {
              key,
              selection,
              value: Math.max(0, Math.min(1, value)),
              representation: representation || 'surface',
            },
          ];
          await applyTransparencyOps();
        });
      },

      labelSelection(selection: SelectionSpec, mode: string) {
        return enqueue(async () => {
          await requireSelectionLoci(selection);
          const key = `label:${selectionKey(selection)}:${mode}`;
          labelOpsRef.current = [
            ...labelOpsRef.current.filter((op) => op.key !== key),
            { key, selection, mode },
          ];
          await rebuildLabels();
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
          plugin.managers.camera.orientAxes([getRootStructure()], 250);
        });
      },

      measureDistance(source: SelectionSpec, target: SelectionSpec) {
        return enqueue(async () => {
          await requireSelectionLoci(source);
          await requireSelectionLoci(target);
          const key = `distance:${selectionKey(source)}:${selectionKey(target)}`;
          distanceOpsRef.current = [
            ...distanceOpsRef.current.filter((op) => op.key !== key),
            { key, source, target },
          ];
          await rebuildDistances();
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
          }
        });
      },
    }), [
      applyColorOps,
      applyTransparencyOps,
      clearMeasurements,
      clearSelectionState,
      createComponentForLoci,
      enqueue,
      extractSelectionSpec,
      getAllComponents,
      getLoadedStructure,
      getPlugin,
      getRootStructure,
      objectMatchesCurrent,
      rebuildDistances,
      rebuildLabels,
      reapplySceneDecorations,
      requireSelectionLoci,
      resetSceneOps,
    ]);

    return (
      <div className={className} style={{ position: 'relative', minHeight: 0, minWidth: 0 }}>
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-hidden"
          style={{ background: '#111111' }}
        />
      </div>
    );
  }
);

export default MoleculeViewer;
