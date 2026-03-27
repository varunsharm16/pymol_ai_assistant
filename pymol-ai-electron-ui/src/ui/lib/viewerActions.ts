import type { MoleculeViewerHandle, SelectionSpec } from '../components/MoleculeViewer';

/**
 * Execute a normalized command spec against the MoleculeViewer.
 * Returns a human-readable message for the command log.
 */
export function executeCommandSpec(
  spec: { name: string; arguments?: Record<string, any> },
  viewer: MoleculeViewerHandle
): { ok: boolean; message: string } {
  const { name, arguments: args = {} } = spec;

  try {
    switch (name) {
      case 'show_representation': {
        const target = args.target as SelectionSpec;
        const repr = args.representation as string;
        if (!target || !repr) return { ok: false, message: 'Missing target or representation' };
        viewer.showRepresentation(target, repr);
        return { ok: true, message: `Showing ${repr} for ${describeSelection(target)}` };
      }

      case 'hide_representation': {
        const target = args.target as SelectionSpec;
        const repr = args.representation as string;
        if (!target) return { ok: false, message: 'Missing target' };
        viewer.hideRepresentation(target, repr || 'everything');
        return { ok: true, message: `Hidden ${repr || 'everything'} for ${describeSelection(target)}` };
      }

      case 'isolate_selection': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        viewer.isolateSelection(target, args.representation);
        return { ok: true, message: `Isolated ${describeSelection(target)}` };
      }

      case 'remove_selection': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        viewer.removeSelection(target);
        return { ok: true, message: `Removed ${describeSelection(target)}` };
      }

      case 'color_selection': {
        const target = args.target as SelectionSpec;
        const color = args.color as string;
        if (!target || !color) return { ok: false, message: 'Missing target or color' };
        viewer.colorSelection(target, color);
        return { ok: true, message: `Colored ${describeSelection(target)} ${color}` };
      }

      case 'color_by_chain': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        viewer.colorByChain(target);
        return { ok: true, message: `Colored ${describeSelection(target)} by chain` };
      }

      case 'color_by_element': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        viewer.colorByElement(target);
        return { ok: true, message: `Colored ${describeSelection(target)} by element` };
      }

      case 'set_transparency': {
        const target = args.target as SelectionSpec;
        const value = args.value as number;
        const repr = (args.representation as string) || 'surface';
        if (!target || value == null) return { ok: false, message: 'Missing target or value' };
        viewer.setTransparency(target, value, repr);
        return { ok: true, message: `Set ${repr} transparency to ${value} on ${describeSelection(target)}` };
      }

      case 'label_selection': {
        const target = args.target as SelectionSpec;
        const mode = (args.mode as string) || 'residue';
        if (!target) return { ok: false, message: 'Missing target' };
        viewer.labelSelection(target, mode);
        return { ok: true, message: `Labeled ${describeSelection(target)} (${mode} mode)` };
      }

      case 'zoom_selection': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        viewer.zoomTo(target);
        return { ok: true, message: `Zoomed to ${describeSelection(target)}` };
      }

      case 'orient_selection': {
        const target = args.target as SelectionSpec;
        if (!target) return { ok: false, message: 'Missing target' };
        viewer.orientSelection(target);
        return { ok: true, message: `Oriented on ${describeSelection(target)}` };
      }

      case 'measure_distance': {
        const source = args.source as SelectionSpec;
        const target = args.target as SelectionSpec;
        if (!source || !target) return { ok: false, message: 'Missing source or target' };
        viewer.measureDistance(source, target);
        return { ok: true, message: `Measured distance between ${describeSelection(source)} and ${describeSelection(target)}` };
      }

      case 'set_background': {
        const color = args.color as string;
        if (!color) return { ok: false, message: 'Missing color' };
        viewer.setBackground(color);
        return { ok: true, message: `Background set to ${color}` };
      }

      case 'rotate_view': {
        if (args.axis && args.angle != null) {
          viewer.rotateView(args.axis, args.angle);
          return { ok: true, message: `Rotated ${args.angle}° around ${args.axis}` };
        }
        // Handle multi-axis rotation
        for (const axis of ['x', 'y', 'z']) {
          const val = args[axis] ?? args[`rotate_${axis}`];
          if (typeof val === 'number' && val !== 0) {
            viewer.rotateView(axis.toUpperCase(), val);
          }
        }
        if (args.rotation && Array.isArray(args.rotation)) {
          const axes = ['X', 'Y', 'Z'];
          args.rotation.forEach((val: number, i: number) => {
            if (val !== 0) viewer.rotateView(axes[i], val);
          });
        }
        return { ok: true, message: 'View rotated' };
      }

      case 'snapshot': {
        const dataUri = viewer.snapshot();
        if (!dataUri) return { ok: false, message: 'No viewer available for snapshot' };
        // Trigger download
        const link = document.createElement('a');
        link.download = args.filename || 'nexmol-snapshot.png';
        link.href = dataUri;
        link.click();
        return { ok: true, message: `Snapshot saved as ${args.filename || 'nexmol-snapshot.png'}` };
      }

      default:
        return { ok: false, message: `Unknown command: ${name}` };
    }
  } catch (err: any) {
    return { ok: false, message: err?.message || `Failed to execute ${name}` };
  }
}

/**
 * Produce a human-readable description of a selection spec.
 */
function describeSelection(spec: SelectionSpec): string {
  const kind = spec.kind;
  if (kind === 'all') return 'everything';
  if (kind === 'protein') return 'protein';
  if (kind === 'ligand') return 'ligand';
  if (kind === 'water') return 'waters';
  if (kind === 'metals') return 'metals';
  if (kind === 'hydrogens') return 'hydrogens';
  if (kind === 'current_selection') return 'current selection';

  if (kind === 'chain') {
    return `chain ${spec.chain}`;
  }
  if (kind === 'residue') {
    let desc = `residue ${spec.residue}`;
    if (spec.resi) desc += ` ${spec.resi}`;
    if (spec.chain) desc += ` in chain ${spec.chain}`;
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
