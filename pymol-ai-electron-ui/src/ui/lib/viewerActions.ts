import type { MoleculeViewerHandle, SelectionSpec } from '../components/MoleculeViewer';
import { DEFAULT_SEQUENCE_PANEL_WIDTH, useStore, type NormalizedSpec, type ViewerState } from '../store';

const DEFERRED_MESSAGES: Record<string, string> = {
  show_contacts: 'Show contacts is staged for NexMol but not implemented yet.',
  align_objects: 'Align objects is staged for NexMol but still needs backend alignment support.',
};

function mapSequenceFormatToMode(format: string): { mode: 'single' | 'polymers' | 'all' | null; message?: string } {
  if (format === 'residue_codes') {
    return { mode: 'single' };
  }
  if (format === 'chain_identifiers') {
    return { mode: 'polymers' };
  }
  if (format === 'residue_names' || format === 'atom_names') {
    return {
      mode: null,
      message: `${format.replace('_', ' ')} is not available in the Mol* sequence view yet.`,
    };
  }
  return { mode: null, message: `Unsupported sequence format: ${format}` };
}

/**
 * Execute a normalized command spec against the MoleculeViewer.
 * Returns a human-readable message for the command log.
 */
export async function executeCommandSpec(
  spec: NormalizedSpec,
  viewer: MoleculeViewerHandle
): Promise<{ ok: boolean; message: string }> {
  const { name, arguments: args = {} } = spec;

  try {
    switch (name) {
      case 'show_representation': {
        const target = args.target as SelectionSpec;
        const repr = args.representation as string;
        if (!target || !repr) return { ok: false, message: 'Missing target or representation' };
        await viewer.showRepresentation(target, repr);
        return { ok: true, message: `Showing ${repr} for ${describeSelection(target)}` };
      }

      case 'hide_representation': {
        const target = args.target as SelectionSpec;
        const repr = args.representation as string;
        if (!target) return { ok: false, message: 'Missing target' };
        await viewer.hideRepresentation(target, repr || 'everything');
        return { ok: true, message: `Hidden ${repr || 'everything'} for ${describeSelection(target)}` };
      }

      case 'isolate_selection': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        await viewer.isolateSelection(target, args.representation);
        return { ok: true, message: `Isolated ${describeSelection(target)}` };
      }

      case 'remove_selection': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        await viewer.removeSelection(target);
        return { ok: true, message: `Removed ${describeSelection(target)}` };
      }

      case 'color_selection': {
        const target = args.target as SelectionSpec;
        const color = args.color as string;
        if (!target || !color) return { ok: false, message: 'Missing target or color' };
        await viewer.colorSelection(target, color);
        return { ok: true, message: `Colored ${describeSelection(target)} ${color}` };
      }

      case 'color_by_chain': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        await viewer.colorByChain(target);
        return { ok: true, message: `Colored ${describeSelection(target)} by chain` };
      }

      case 'color_by_element': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        await viewer.colorByElement(target);
        return { ok: true, message: `Colored ${describeSelection(target)} by element` };
      }

      case 'set_transparency': {
        const target = args.target as SelectionSpec;
        const value = args.value as number;
        const repr = (args.representation as string) || 'surface';
        if (!target || value == null) return { ok: false, message: 'Missing target or value' };
        await viewer.setTransparency(target, value, repr);
        return { ok: true, message: `Set ${repr} transparency to ${value} on ${describeSelection(target)}` };
      }

      case 'label_selection': {
        const target = args.target as SelectionSpec;
        const mode = (args.mode as string) || 'residue';
        if (!target) return { ok: false, message: 'Missing target' };
        await viewer.labelSelection(target, mode);
        return { ok: true, message: `Labeled ${describeSelection(target)} (${mode} mode)` };
      }

      case 'clear_labels': {
        const target = args.target as SelectionSpec | undefined;
        await viewer.clearLabels(target);
        return {
          ok: true,
          message: target ? `Cleared labels on ${describeSelection(target)}` : 'Cleared labels',
        };
      }

      case 'zoom_selection': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        await viewer.zoomTo(target);
        return { ok: true, message: `Zoomed to ${describeSelection(target)}` };
      }

      case 'orient_selection': {
        return { ok: false, message: 'Orient is not available in this NexMol build. Use zoom instead.' };
      }

      case 'measure_distance': {
        const source = args.source as SelectionSpec;
        const target = args.target as SelectionSpec;
        if (!source || !target) return { ok: false, message: 'Missing source or target' };
        await viewer.measureDistance(source, target);
        return { ok: true, message: `Measured distance between ${describeSelection(source)} and ${describeSelection(target)}` };
      }

      case 'clear_measurements': {
        await viewer.clearDistanceMeasurements();
        return { ok: true, message: 'Cleared measurements' };
      }

      case 'set_background': {
        const color = args.color as string;
        if (!color) return { ok: false, message: 'Missing color' };
        await viewer.setBackground(color);
        return { ok: true, message: `Background set to ${color}` };
      }

      case 'rotate_view': {
        if (args.axis && args.angle != null) {
          await viewer.rotateView(args.axis, args.angle);
          return { ok: true, message: `Rotated ${args.angle}° around ${args.axis}` };
        }
        // Handle multi-axis rotation
        for (const axis of ['x', 'y', 'z']) {
          const val = args[axis] ?? args[`rotate_${axis}`];
          if (typeof val === 'number' && val !== 0) {
            await viewer.rotateView(axis.toUpperCase(), val);
          }
        }
        if (args.rotation && Array.isArray(args.rotation)) {
          const axes = ['X', 'Y', 'Z'];
          for (let i = 0; i < args.rotation.length; i += 1) {
            const val = args.rotation[i];
            if (val !== 0) {
              await viewer.rotateView(axes[i], val);
            }
          }
        }
        return { ok: true, message: 'View rotated' };
      }

      case 'snapshot': {
        const dataUri = await viewer.snapshot();
        if (!dataUri) return { ok: false, message: 'No viewer available for snapshot' };
        // Trigger download
        const link = document.createElement('a');
        link.download = args.filename || 'nexmol-snapshot.png';
        link.href = dataUri;
        link.click();
        return { ok: true, message: `Snapshot saved as ${args.filename || 'nexmol-snapshot.png'}` };
      }

      case 'show_contacts':
      case 'align_objects':
        return { ok: false, message: DEFERRED_MESSAGES[name] };

      case 'show_sequence_view': {
        useStore.getState().setSequenceUiOpen(true);
        return { ok: true, message: 'Opened sequence view' };
      }

      case 'hide_sequence_view': {
        useStore.getState().setSequenceUiOpen(false);
        return { ok: true, message: 'Closed sequence view' };
      }

      case 'set_sequence_view_format': {
        const format = args.format as string;
        const mapped = mapSequenceFormatToMode(format);
        if (!mapped.mode) {
          return { ok: false, message: mapped.message || 'Unsupported sequence format.' };
        }
        const store = useStore.getState();
        store.setSequenceUiMode(mapped.mode);
        store.setSequenceUiOpen(true);
        return { ok: true, message: `Opened sequence view in ${mapped.mode} mode` };
      }

      default:
        return { ok: false, message: `Unknown command: ${name}` };
    }
  } catch (err: any) {
    return { ok: false, message: err?.message || `Failed to execute ${name}` };
  }
}

function cloneSpec<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function materializeSelectionForPersistence(selection: SelectionSpec | undefined): SelectionSpec | undefined {
  if (!selection) return undefined;
  const store = useStore.getState();

  if (selection.kind === 'current_selection') {
    return store.currentViewerSelection ? cloneSpec(store.currentViewerSelection as SelectionSpec) : undefined;
  }

  if (selection.kind === 'active_selection') {
    const items = (store.activeViewerSelections || []).map((item) => cloneSpec(item as SelectionSpec));
    if (!items.length) return undefined;
    if (items.length === 1) return items[0];
    return { kind: 'selection_set', items };
  }

  if (selection.kind === 'selection_set') {
    return {
      kind: 'selection_set',
      items: (selection.items || []).map((item) => materializeSelectionForPersistence(item) || item),
    };
  }

  return cloneSpec(selection);
}

function materializeSpecForPersistence(spec: NormalizedSpec): NormalizedSpec {
  const cloned = cloneSpec(spec);
  const args = { ...(cloned.arguments || {}) };
  const store = useStore.getState();

  if (cloned.name === 'measure_distance') {
    const source = args.source as SelectionSpec | undefined;
    const target = args.target as SelectionSpec | undefined;
    if (source?.kind === 'current_selection' && target?.kind === 'current_selection' && store.selectedResiduePair.length >= 2) {
      args.source = cloneSpec(store.selectedResiduePair[0] as SelectionSpec);
      args.target = cloneSpec(store.selectedResiduePair[1] as SelectionSpec);
    } else {
      args.source = materializeSelectionForPersistence(source);
      args.target = materializeSelectionForPersistence(target);
    }
  } else if ('target' in args) {
    args.target = materializeSelectionForPersistence(args.target as SelectionSpec | undefined);
  }

  cloned.arguments = args;
  return cloned;
}

function selectionsEquivalent(a?: SelectionSpec, b?: SelectionSpec): boolean {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function operationKey(spec: NormalizedSpec): string | null {
  const args = spec.arguments || {};
  switch (spec.name) {
    case 'color_selection':
    case 'color_by_chain':
    case 'color_by_element':
      return `color:${JSON.stringify(args.target || {})}`;
    case 'set_transparency':
    case 'remove_selection':
      return `transparency:${JSON.stringify(args.target || {})}:${args.representation || 'all'}`;
    case 'label_selection':
      return `label:${JSON.stringify(args.target || {})}:${args.mode || 'residue'}`;
    case 'clear_labels':
      return 'labels:clear';
    case 'measure_distance': {
      const pair = [JSON.stringify(args.source || {}), JSON.stringify(args.target || {})].sort();
      return `distance:${pair[0]}:${pair[1]}`;
    }
    case 'show_representation':
    case 'hide_representation':
      return `representation:${spec.name}:${JSON.stringify(args.target || {})}:${args.representation || 'default'}`;
    case 'isolate_selection':
      return `isolate:${JSON.stringify(args.target || {})}:${args.representation || 'default'}`;
    default:
      return null;
  }
}

function shouldPersistOperation(spec: NormalizedSpec): boolean {
  return ![
    'snapshot',
    'set_background',
    'rotate_view',
    'zoom_selection',
    'orient_selection',
    'clear_labels',
    'clear_measurements',
  ].includes(spec.name);
}

export function updateViewerStateAfterCommand(
  current: ViewerState | undefined,
  spec: NormalizedSpec,
  snapshot: { backgroundColor?: string; cameraSnapshot?: any }
): ViewerState {
  let nextOperations = [...(current?.operations || [])];
  const materialized = materializeSpecForPersistence(spec);
  if (materialized.name === 'clear_measurements') {
    nextOperations = nextOperations.filter((op) => op.name !== 'measure_distance');
  }
  if (materialized.name === 'clear_labels') {
    const clearTarget = materialized.arguments?.target as SelectionSpec | undefined;
    nextOperations = nextOperations.filter((op) => {
      if (op.name !== 'label_selection') return true;
      if (!clearTarget) return false;
      const labelTarget = op.arguments?.target as SelectionSpec | undefined;
      return !selectionsEquivalent(labelTarget, clearTarget);
    });
  }
  if (shouldPersistOperation(materialized)) {
    const cloned = cloneSpec(materialized);
    const key = operationKey(cloned);
    if (key) {
      const index = nextOperations.findIndex((op) => operationKey(op) === key);
      if (index >= 0) {
        nextOperations[index] = cloned;
      } else {
        nextOperations.push(cloned);
      }
    } else {
      nextOperations.push(cloned);
    }
  }

  return {
    backgroundColor: snapshot.backgroundColor,
    cameraSnapshot: snapshot.cameraSnapshot ? cloneSpec(snapshot.cameraSnapshot) : undefined,
    sequenceUi: cloneSpec(useStore.getState().sequenceUi),
    operations: nextOperations,
  };
}

async function replayOperation(viewer: MoleculeViewerHandle, spec: NormalizedSpec): Promise<void> {
  const args = spec.arguments || {};
  switch (spec.name) {
    case 'show_representation':
      await viewer.showRepresentation(args.target as SelectionSpec, args.representation as string);
      return;
    case 'hide_representation':
      await viewer.hideRepresentation(args.target as SelectionSpec, (args.representation as string) || 'everything');
      return;
    case 'isolate_selection':
      await viewer.isolateSelection(args.target as SelectionSpec, args.representation as string | undefined);
      return;
    case 'remove_selection':
      await viewer.removeSelection(args.target as SelectionSpec);
      return;
    case 'color_selection':
      await viewer.colorSelection(args.target as SelectionSpec, args.color as string);
      return;
    case 'color_by_chain':
      await viewer.colorByChain(args.target as SelectionSpec);
      return;
    case 'color_by_element':
      await viewer.colorByElement(args.target as SelectionSpec);
      return;
    case 'set_transparency':
      await viewer.setTransparency(args.target as SelectionSpec, args.value as number, (args.representation as string) || 'surface');
      return;
    case 'label_selection':
      await viewer.labelSelection(args.target as SelectionSpec, (args.mode as string) || 'residue');
      return;
    case 'measure_distance':
      await viewer.measureDistance(args.source as SelectionSpec, args.target as SelectionSpec);
      return;
    default:
      throw new Error(`Unsupported restore operation: ${spec.name}`);
  }
}

function restoreStage(spec: NormalizedSpec): number {
  switch (spec.name) {
    case 'show_representation':
    case 'hide_representation':
    case 'isolate_selection':
    case 'remove_selection':
      return 0;
    case 'color_selection':
    case 'color_by_chain':
    case 'color_by_element':
      return 1;
    case 'set_transparency':
      return 2;
    case 'label_selection':
      return 3;
    case 'measure_distance':
      return 4;
    default:
      return 99;
  }
}

export async function restoreViewerState(
  viewerState: ViewerState | undefined,
  viewer: MoleculeViewerHandle
): Promise<string[]> {
  const store = useStore.getState();
  const applySequenceUi = (sequenceUi?: ViewerState['sequenceUi']) => {
    store.setSequenceUiMode(sequenceUi?.mode || 'single');
    store.setSequenceUiWidth(sequenceUi?.width || DEFAULT_SEQUENCE_PANEL_WIDTH);
    store.setSequenceUiOpen(sequenceUi?.open || false);
  };
  if (!viewerState) {
    applySequenceUi(undefined);
    return [];
  }

  const errors: string[] = [];
  try {
    await viewer.applySceneSnapshot({
      backgroundColor: viewerState.backgroundColor,
    });
  } catch (error: any) {
    errors.push(error?.message || 'Failed to restore viewer scene snapshot.');
  }

  if (viewer.hasStructure()) {
    const operations = [...(viewerState.operations || [])].sort((a, b) => restoreStage(a) - restoreStage(b));
    for (const operation of operations) {
      try {
        await replayOperation(viewer, operation);
      } catch (error: any) {
        errors.push(`Failed to restore ${operation.name}: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  applySequenceUi(viewerState.sequenceUi);

  return errors;
}

/**
 * Produce a human-readable description of a selection spec.
 */
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

  if (kind === 'chain') {
    return `chain ${spec.chain}`;
  }
  if (kind === 'residue') {
    let desc = spec.allMatches && !spec.resi ? `all ${spec.residue} residues` : `residue ${spec.residue}`;
    if (spec.resi) desc += ` ${spec.resi}`;
    if (spec.chain) desc += ` in chain ${spec.chain}`;
    if (spec.object) desc += ` in object ${spec.object}`;
    return desc;
  }
  if (kind === 'atom') {
    let desc = `atom ${spec.atom}`;
    if (spec.residue) desc += ` in ${spec.residue}`;
    if (spec.resi) desc += ` ${spec.resi}`;
    if (spec.chain) desc += ` chain ${spec.chain}`;
    return desc;
  }
  if (kind === 'object') {
    return `object ${spec.object}`;
  }
  return kind;
}
