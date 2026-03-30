export type SelectionSpec =
  | { kind: 'all' }
  | { kind: 'protein'; chain?: string; object?: string }
  | { kind: 'ligand'; chain?: string; object?: string }
  | { kind: 'water'; chain?: string; object?: string }
  | { kind: 'metals'; chain?: string; object?: string }
  | { kind: 'hydrogens'; chain?: string; object?: string }
  | { kind: 'active_selection' }
  | { kind: 'current_selection' }
  | { kind: 'chain'; chain: string; object?: string }
  | { kind: 'residue'; residue: string; chain?: string; resi?: string; object?: string; allMatches?: boolean }
  | { kind: 'atom'; atom: string; residue?: string; chain?: string; resi?: string; object?: string }
  | { kind: 'object'; object: string };

export type Representation =
  | 'cartoon'
  | 'sticks'
  | 'surface'
  | 'spheres'
  | 'lines'
  | 'mesh'
  | 'dots';

export type Spec = { name: string; arguments?: Record<string, any> };
export type SelectionTagContext = { label: string; target: SelectionSpec };

const RES_MAP: Record<string, string> = {
  A: 'ALA',
  C: 'CYS',
  D: 'ASP',
  E: 'GLU',
  F: 'PHE',
  G: 'GLY',
  H: 'HIS',
  I: 'ILE',
  K: 'LYS',
  L: 'LEU',
  M: 'MET',
  N: 'ASN',
  P: 'PRO',
  Q: 'GLN',
  R: 'ARG',
  S: 'SER',
  T: 'THR',
  V: 'VAL',
  W: 'TRP',
  Y: 'TYR',
};

const FULL_RESIDUE_NAMES: Record<string, string> = {
  ALANINE: 'ALA',
  CYSTEINE: 'CYS',
  ASPARTATE: 'ASP',
  ASPARTICACID: 'ASP',
  GLUTAMATE: 'GLU',
  GLUTAMICACID: 'GLU',
  PHENYLALANINE: 'PHE',
  GLYCINE: 'GLY',
  HISTIDINE: 'HIS',
  ISOLEUCINE: 'ILE',
  LYSINE: 'LYS',
  LEUCINE: 'LEU',
  METHIONINE: 'MET',
  ASPARAGINE: 'ASN',
  PROLINE: 'PRO',
  GLUTAMINE: 'GLN',
  ARGININE: 'ARG',
  SERINE: 'SER',
  THREONINE: 'THR',
  VALINE: 'VAL',
  TRYPTOPHAN: 'TRP',
  TYROSINE: 'TYR',
};

const REP_ALIASES: Record<string, Representation> = {
  cartoon: 'cartoon',
  ribbon: 'cartoon',
  surface: 'surface',
  stick: 'sticks',
  sticks: 'sticks',
  line: 'lines',
  lines: 'lines',
  sphere: 'spheres',
  spheres: 'spheres',
  mesh: 'mesh',
  dot: 'dots',
  dots: 'dots',
};

const SEQUENCE_FORMAT_ALIASES: Record<string, string> = {
  'residue code': 'residue_codes',
  'residue codes': 'residue_codes',
  codes: 'residue_codes',
  'residue name': 'residue_names',
  'residue names': 'residue_names',
  names: 'residue_names',
  'atom name': 'atom_names',
  'atom names': 'atom_names',
  atoms: 'atom_names',
  'chain identifier': 'chain_identifiers',
  'chain identifiers': 'chain_identifiers',
  chains: 'chain_identifiers',
};

const COLOR_VERBS = '(?:color|colour|make|turn|paint|highlight)';

function clean(text: string) {
  return text
    .trim()
    .replace(/[.?!]+$/g, '')
    .replace(/^the\s+/i, '');
}

function normalizeResidue(value: string) {
  const paren = value.match(/\(([A-Za-z]{1,3})\)/);
  if (paren) {
    return normalizeResidue(paren[1]);
  }
  const letters = value.toUpperCase().replace(/[^A-Z]/g, '');
  if (FULL_RESIDUE_NAMES[letters]) {
    return FULL_RESIDUE_NAMES[letters];
  }
  if (letters.endsWith('S') && FULL_RESIDUE_NAMES[letters.slice(0, -1)]) {
    return FULL_RESIDUE_NAMES[letters.slice(0, -1)];
  }
  if (letters.length === 1 && RES_MAP[letters]) {
    return RES_MAP[letters];
  }
  return letters;
}

function parseRepresentation(value: string | undefined): Representation | null {
  if (!value) return null;
  return REP_ALIASES[clean(value).toLowerCase()] || null;
}

function parseTransparencyValue(value: string): number | null {
  const raw = clean(value).replace(/%$/, '');
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 1 ? Math.max(0, Math.min(1, numeric / 100)) : Math.max(0, Math.min(1, numeric));
}

function parseSequenceFormat(value: string | undefined): string | null {
  if (!value) return null;
  return SEQUENCE_FORMAT_ALIASES[clean(value).toLowerCase()] || null;
}

function normalizeScopedSimpleKind(value: string): 'protein' | 'ligand' | 'water' | 'metals' | 'hydrogens' | null {
  const lower = value.trim().toLowerCase();
  if (lower === 'protein') return 'protein';
  if (lower === 'ligand') return 'ligand';
  if (lower === 'water' || lower === 'waters' || lower === 'solvent') return 'water';
  if (lower === 'metal' || lower === 'metals') return 'metals';
  if (lower === 'hydrogen' || lower === 'hydrogens') return 'hydrogens';
  return null;
}

function parseTarget(input: string, context?: SelectionTagContext | null): SelectionSpec | null {
  const text = clean(input)
    .replace(/^for\s+/i, '')
    .replace(/^on\s+/i, '')
    .replace(/^to\s+/i, '')
    .replace(/^only\s+/i, '')
    .replace(/^the\s+/i, '')
    .trim();
  const lower = text.toLowerCase();

  if (!text) return null;
  if (context && text === context.label) {
    return context.target;
  }
  if (
    [
      'all',
      'everything',
      'all atoms',
      'all chains',
      'entire molecule',
      'whole molecule',
      'molecule',
      'entire protein',
      'structure',
      'scene',
      'model',
    ].includes(lower)
  ) {
    return { kind: 'all' };
  }
  if (['protein', 'the protein'].includes(lower)) return { kind: 'protein' };
  if (['ligand', 'the ligand'].includes(lower)) return { kind: 'ligand' };
  if (['water', 'waters', 'water molecules', 'solvent'].includes(lower)) return { kind: 'water' };
  if (['metals', 'metal', 'metal atoms'].includes(lower)) return { kind: 'metals' };
  if (['hydrogen', 'hydrogens', 'hydrogen atoms'].includes(lower)) return { kind: 'hydrogens' };
  if (['current selection', 'current residue'].includes(lower)) {
    return { kind: 'current_selection' };
  }
  if (['selection', 'selected', 'selected atoms', 'picked atoms'].includes(lower)) {
    return { kind: 'active_selection' };
  }

  const scopedSimple = text.match(
    /^(protein|ligand|water|waters|solvent|metal|metals|hydrogen|hydrogens)(?:\s+in\s+chain\s+([A-Za-z]))?(?:\s+in\s+object\s+([A-Za-z0-9_.-]+))?$/i
  );
  if (scopedSimple) {
    const kind = normalizeScopedSimpleKind(scopedSimple[1]);
    if (!kind) return null;
    return {
      kind,
      ...(scopedSimple[2] ? { chain: scopedSimple[2].toUpperCase() } : {}),
      ...(scopedSimple[3] ? { object: scopedSimple[3] } : {}),
    } as SelectionSpec;
  }

  const chain = text.match(/^chain\s+([A-Za-z])(?:\s+in\s+object\s+([A-Za-z0-9_.-]+))?$/i);
  if (chain) {
    return {
      kind: 'chain',
      chain: chain[1].toUpperCase(),
      ...(chain[2] ? { object: chain[2] } : {}),
    };
  }

  const allResidueShorthand = text.match(
    /^all\s+([A-Za-z]{1,3}|[A-Za-z]+)(?:\s+in\s+chain\s+([A-Za-z]))?(?:\s+in\s+object\s+([A-Za-z0-9_.-]+))?$/i
  );
  if (allResidueShorthand) {
    const normalized = normalizeResidue(allResidueShorthand[1]);
    if (!normalized || normalized.length !== 3) return null;
    return {
      kind: 'residue',
      residue: normalized,
      allMatches: true,
      ...(allResidueShorthand[2] ? { chain: allResidueShorthand[2].toUpperCase() } : {}),
      ...(allResidueShorthand[3] ? { object: allResidueShorthand[3] } : {}),
    };
  }

  const allResidues = text.match(
    /^(?:all\s+)?([A-Za-z]{1,3}|[A-Za-z]+)\s+residues?(?:\s+in\s+chain\s+([A-Za-z]))?(?:\s+in\s+object\s+([A-Za-z0-9_.-]+))?$/i
  );
  if (allResidues) {
    const normalized = normalizeResidue(allResidues[1]);
    if (!normalized || normalized.length !== 3) return null;
    return {
      kind: 'residue',
      residue: normalized,
      allMatches: true,
      ...(allResidues[2] ? { chain: allResidues[2].toUpperCase() } : {}),
      ...(allResidues[3] ? { object: allResidues[3] } : {}),
    };
  }

  const residue = text.match(
    /^(?:residue\s+)?([A-Za-z]{1,3})(?:\s+(\d+[A-Za-z]?))?(?:\s+in\s+chain\s+([A-Za-z]))?(?:\s+in\s+object\s+([A-Za-z0-9_.-]+))?$/i
  );
  if (residue) {
    const normalized = normalizeResidue(residue[1]);
    if (!normalized) return null;
    return {
      kind: 'residue',
      residue: normalized,
      ...(residue[2] ? { resi: residue[2] } : {}),
      ...(residue[3] ? { chain: residue[3].toUpperCase() } : {}),
      ...(residue[4] ? { object: residue[4] } : {}),
    };
  }

  const atom = text.match(
    /^atom\s+([A-Za-z0-9'_*]+)(?:\s+in\s+residue\s+([A-Za-z]{1,3}))?(?:\s+(\d+[A-Za-z]?))?(?:\s+in\s+chain\s+([A-Za-z]))?(?:\s+in\s+object\s+([A-Za-z0-9_.-]+))?$/i
  );
  if (atom) {
    const residueName = atom[2] ? normalizeResidue(atom[2]) : undefined;
    return {
      kind: 'atom',
      atom: atom[1].toUpperCase(),
      ...(residueName ? { residue: residueName } : {}),
      ...(atom[3] ? { resi: atom[3] } : {}),
      ...(atom[4] ? { chain: atom[4].toUpperCase() } : {}),
      ...(atom[5] ? { object: atom[5] } : {}),
    };
  }

  const object = text.match(/^object\s+([A-Za-z0-9_.-]+)$/i);
  if (object) {
    return { kind: 'object', object: object[1] };
  }

  return null;
}

function splitPairTargets(text: string): [string, string] | null {
  const marker = text.match(/\bbetween\s+(.+?)\s+and\s+(.+)$/i);
  if (!marker) return null;
  return [marker[1].trim(), marker[2].trim()];
}

export function parsePromptToSpec(input: string, options?: { selectionTag?: SelectionTagContext | null }): Spec | null {
  const t = input.trim();
  const selectionTag = options?.selectionTag || null;

  // Keep compound actions out of the deterministic parser.
  if ((/\band\b/i.test(t) || /\bthen\b/i.test(t)) && !/\bbetween\b/i.test(t)) {
    return null;
  }

  // Background
  const bg = t.match(
    /^(?:set|make|turn|color|colour)\s+(?:the\s+)?(?:background|background color|bg)\s+(?:to\s+)?([a-z#0-9]+)$/i
  );
  if (bg) return { name: 'set_background', arguments: { color: bg[1].toLowerCase() } };

  // Rotate
  const rot = t.match(/rotate\s+(-?\d+(?:\.\d+)?)\s+(?:deg(?:rees?)?\s+)?(?:around|about|on)\s+([XYZxyz])/);
  if (rot) return { name: 'rotate_view', arguments: { axis: rot[2].toUpperCase(), angle: Number(rot[1]) } };

  // Snapshot
  const shot = t.match(
    /^(?:save|take|capture|export)(?:\s+a)?(?:\s+png)?\s+(?:snapshot|picture|pic|image)(?:\s+(?:as|named|called))?(?:\s+(.+))?$/i
  ) || t.match(/^(?:save\s+)?snapshot(?:\s+(?:as|named|called))?(?:\s+(.+))?$/i);
  if (shot) return { name: 'snapshot', arguments: { filename: (shot[1] || '').trim() } };

  // Sequence view
  const showSequence = t.match(/^(?:show|display|open)\s+sequence(?:\s+(?:as|with)\s+(.+))?$/i);
  if (showSequence) {
    const format = parseSequenceFormat(showSequence[1]);
    if (showSequence[1] && format) {
      return { name: 'set_sequence_view_format', arguments: { format } };
    }
    return { name: 'show_sequence_view', arguments: {} };
  }
  if (/^(?:hide|close)\s+sequence$/i.test(t)) {
    return { name: 'hide_sequence_view', arguments: {} };
  }
  const sequenceMode = t.match(/^sequence\s+(?:mode|format)\s+(.+)$/i);
  if (sequenceMode) {
    const format = parseSequenceFormat(sequenceMode[1]);
    if (format) {
      return { name: 'set_sequence_view_format', arguments: { format } };
    }
  }

  // Measurement clearing
  if (/^(?:remove|clear)\s+(?:distance\s+)?measurements?$/i.test(t) || /^(?:remove|clear)\s+distances?$/i.test(t)) {
    return { name: 'clear_measurements', arguments: {} };
  }

  // Distance measurement
  if (/^measure distance between selected$/i.test(t)) {
    return {
      name: 'measure_distance',
      arguments: {
        source: { kind: 'current_selection' },
        target: { kind: 'current_selection' },
      },
    };
  }
  if (/measure distance between/i.test(t)) {
    const pair = splitPairTargets(t);
    if (pair) {
      const target = parseTarget(pair[1], selectionTag);
      const resolvedSource = parseTarget(pair[0], selectionTag);
      if (resolvedSource && target) {
        return { name: 'measure_distance', arguments: { source: resolvedSource, target } };
      }
    }
  }
  const measureFromTo = t.match(/^measure(?:\s+the)?\s+distance\s+from\s+(.+?)\s+to\s+(.+)$/i);
  if (measureFromTo) {
    const source = parseTarget(measureFromTo[1], selectionTag);
    const target = parseTarget(measureFromTo[2], selectionTag);
    if (source && target) {
      return { name: 'measure_distance', arguments: { source, target } };
    }
  }

  // Polar contacts
  if (/show (?:polar )?contacts between/i.test(t)) {
    const pair = splitPairTargets(t);
    if (pair) {
      const target = parseTarget(pair[1], selectionTag);
      const resolvedSource = parseTarget(pair[0], selectionTag);
      if (resolvedSource && target) {
        return { name: 'show_contacts', arguments: { source: resolvedSource, target, mode: 'polar' } };
      }
    }
  }

  // Align objects
  const align = t.match(/align\s+object\s+([A-Za-z0-9_.-]+)\s+to\s+object\s+([A-Za-z0-9_.-]+)/i);
  if (align) {
    return {
      name: 'align_objects',
      arguments: {
        mobile: { kind: 'object', object: align[1] },
        target: { kind: 'object', object: align[2] },
        method: 'align',
      },
    };
  }

  // Color by chain / element
  const colorByChain = t.match(/(?:color|colour)(?:\s+(.+?))?\s+by\s+chain$/i);
  if (colorByChain) {
    const target = colorByChain[1] ? parseTarget(colorByChain[1], selectionTag) : { kind: 'all' as const };
    if (target) return { name: 'color_by_chain', arguments: { target } };
  }
  const colorByElement = t.match(/(?:color|colour)(?:\s+(.+?))?\s+by\s+element$/i);
  if (colorByElement) {
    const target = colorByElement[1] ? parseTarget(colorByElement[1], selectionTag) : { kind: 'all' as const };
    if (target) return { name: 'color_by_element', arguments: { target } };
  }

  // Transparency
  const transparency = t.match(
    /set\s+([a-z]+)\s+transparency\s+to\s+([0-9.]+%?)\s+(?:on|for)\s+(.+)$/i
  );
  if (transparency) {
    const representation = parseRepresentation(transparency[1]);
    const value = parseTransparencyValue(transparency[2]);
    const target = parseTarget(transparency[3], selectionTag);
    if (representation && value != null && target) {
      return {
        name: 'set_transparency',
        arguments: { representation, value, target },
      };
    }
  }
  const fadeTransparency = t.match(
    /^(?:fade|make)\s+([a-z]+)\s+(?:on|for)\s+(.+?)\s+(?:to\s+)?([0-9.]+%?)\s+transparent$/i
  );
  if (fadeTransparency) {
    const representation = parseRepresentation(fadeTransparency[1]);
    const target = parseTarget(fadeTransparency[2], selectionTag);
    const value = parseTransparencyValue(fadeTransparency[3]);
    if (representation && target && value != null) {
      return {
        name: 'set_transparency',
        arguments: { representation, target, value },
      };
    }
  }
  const makeTransparent = t.match(
    /^(?:make|set)\s+(.+?)\s+([a-z]+)\s+transparent(?:\s+to)?\s+([0-9.]+%?)$/i
  );
  if (makeTransparent) {
    const target = parseTarget(makeTransparent[1], selectionTag);
    const representation = parseRepresentation(makeTransparent[2]);
    const value = parseTransparencyValue(makeTransparent[3]);
    if (target && representation && value != null) {
      return {
        name: 'set_transparency',
        arguments: { representation, target, value },
      };
    }
  }

  // Labeling
  const labelAllResiduesInChain = t.match(/^label\s+all\s+residues?\s+in\s+chain\s+([A-Za-z])$/i);
  if (labelAllResiduesInChain) {
    return {
      name: 'label_selection',
      arguments: {
        target: { kind: 'chain', chain: labelAllResiduesInChain[1].toUpperCase() },
        mode: 'residue',
      },
    };
  }
  const labelChainResidues = t.match(/^label\s+chain\s+([A-Za-z])\s+residues?$/i);
  if (labelChainResidues) {
    return {
      name: 'label_selection',
      arguments: {
        target: { kind: 'chain', chain: labelChainResidues[1].toUpperCase() },
        mode: 'residue',
      },
    };
  }
  const labelResidues = t.match(/^label\s+residues?(?:\s+in\s+chain\s+([A-Za-z]))?$/i);
  if (labelResidues) {
    const target = labelResidues[1]
      ? ({ kind: 'chain', chain: labelResidues[1].toUpperCase() } as const)
      : ({ kind: 'protein' } as const);
    return { name: 'label_selection', arguments: { target, mode: 'residue' } };
  }
  if (/^(?:remove|clear)\s+selected\s+labels?$/i.test(t) || /^(?:remove|clear)\s+labels?\s+on\s+selected$/i.test(t)) {
    return { name: 'clear_labels', arguments: { target: { kind: 'active_selection' } } };
  }
  const clearLabelsOnTarget = t.match(/^(?:remove|clear)\s+labels?\s+(?:on|for)\s+(.+)$/i);
  if (clearLabelsOnTarget) {
    const target = parseTarget(clearLabelsOnTarget[1], selectionTag);
    if (target) {
      return { name: 'clear_labels', arguments: { target } };
    }
  }
  if (/^(?:remove|clear)\s+labels$/i.test(t)) {
    return { name: 'clear_labels', arguments: {} };
  }
  const labelTarget = t.match(/^label\s+(.+)$/i);
  if (labelTarget) {
    const target = parseTarget(labelTarget[1], selectionTag);
    if (target) {
      return {
        name: 'label_selection',
        arguments: { target, mode: target.kind === 'ligand' ? 'atom' : 'residue' },
      };
    }
  }

  // Zoom / orient
  const zoom = t.match(/^(?:zoom|center)\s+(?:to|on)?\s*(.+)$/i);
  if (zoom) {
    const target = parseTarget(zoom[1], selectionTag);
    if (target) return { name: 'zoom_selection', arguments: { target } };
  }

  // Isolate / hide-everything-except
  const isolate = t.match(/^(?:isolate|focus on|hide everything except)\s+(.+)$/i);
  if (isolate) {
    const target = parseTarget(isolate[1], selectionTag);
    if (target) {
      const representation = target.kind === 'ligand' ? 'sticks' : undefined;
      return { name: 'isolate_selection', arguments: { target, ...(representation ? { representation } : {}) } };
    }
  }

  // Remove cleanup actions
  const remove = t.match(/^(?:remove|delete)\s+(.+)$/i);
  if (remove) {
    const target = parseTarget(remove[1], selectionTag);
    if (target) return { name: 'remove_selection', arguments: { target } };
  }

  // Show / hide representation
  const showAs = t.match(/^show\s+(.+?)\s+as\s+([a-z]+)$/i);
  if (showAs) {
    const target = parseTarget(showAs[1], selectionTag);
    const representation = parseRepresentation(showAs[2]);
    if (target && representation) {
      return { name: 'show_representation', arguments: { target, representation } };
    }
  }
  const showRepTarget = t.match(/^show\s+([a-z]+)\s+(?:representation\s+)?(?:of|for)\s+(.+)$/i);
  if (showRepTarget) {
    const representation = parseRepresentation(showRepTarget[1]);
    const target = parseTarget(showRepTarget[2], selectionTag);
    if (representation && target) {
      return { name: 'show_representation', arguments: { target, representation } };
    }
  }
  const showRepOnTarget = t.match(/^(?:show|display)\s+([a-z]+)\s+(?:on|for)\s+(.+)$/i);
  if (showRepOnTarget) {
    const representation = parseRepresentation(showRepOnTarget[1]);
    const target = parseTarget(showRepOnTarget[2], selectionTag);
    if (representation && target) {
      return { name: 'show_representation', arguments: { target, representation } };
    }
  }
  const showTargetRep = t.match(/^show\s+(.+?)\s+(?:representation\s+)?(?:of\s+)?(?:the\s+)?([a-z]+)$/i);
  if (showTargetRep) {
    const target = parseTarget(showTargetRep[2], selectionTag);
    const representation = parseRepresentation(showTargetRep[1]);
    if (representation && target) {
      return { name: 'show_representation', arguments: { target, representation } };
    }
  }
  const showLegacyRep = t.match(/^show\s+(cartoon|ribbon|surface|sticks?|spheres?|mesh|dots?|lines?)$/i);
  if (showLegacyRep) {
    const representation = parseRepresentation(showLegacyRep[1]);
    if (representation) {
      return { name: 'show_representation', arguments: { target: { kind: 'all' }, representation } };
    }
  }

  const hideRepTarget = t.match(/^hide\s+([a-z]+|everything)\s+(?:for|on)\s+(.+)$/i);
  if (hideRepTarget) {
    const target = parseTarget(hideRepTarget[2], selectionTag);
    const representation = hideRepTarget[1].toLowerCase() === 'everything'
      ? 'everything'
      : parseRepresentation(hideRepTarget[1]);
    if (target && representation) {
      return { name: 'hide_representation', arguments: { target, representation } };
    }
  }
  const hideRepOfTarget = t.match(/^hide\s+([a-z]+)\s+(?:representation\s+)?(?:of|for)\s+(.+)$/i);
  if (hideRepOfTarget) {
    const target = parseTarget(hideRepOfTarget[2], selectionTag);
    const representation = parseRepresentation(hideRepOfTarget[1]);
    if (target && representation) {
      return { name: 'hide_representation', arguments: { target, representation } };
    }
  }

  // Generic color commands
  const residueFamilyColor = t.match(
    new RegExp(`^${COLOR_VERBS}\\s+(?:all\\s+)?(.+?)\\s+residues?(?:\\s+in\\s+chain\\s+([A-Za-z]))?\\s+(?:to\\s+)?([a-z#0-9]+)$`, 'i')
  );
  if (residueFamilyColor) {
    const residueName = normalizeResidue(residueFamilyColor[1]);
    if (residueName) {
      return {
        name: 'color_selection',
        arguments: {
          target: {
            kind: 'residue',
            residue: residueName,
            ...(residueFamilyColor[2] ? { chain: residueFamilyColor[2].toUpperCase() } : {}),
          },
          color: residueFamilyColor[3].toLowerCase(),
        },
      };
    }
  }

  const all = t.match(new RegExp(`^${COLOR_VERBS}\\s+all\\s+(?:to\\s+)?([a-z#0-9]+)$`, 'i'));
  const allChains = t.match(new RegExp(`^${COLOR_VERBS}\\s+all\\s+chains\\s+(?:to\\s+)?([a-z#0-9]+)$`, 'i'));
  if (allChains) {
    return {
      name: 'color_selection',
      arguments: { target: { kind: 'all' }, color: allChains[1].toLowerCase() },
    };
  }
  if (all) return { name: 'color_selection', arguments: { target: { kind: 'all' }, color: all[1].toLowerCase() } };

  const chain = t.match(new RegExp(`^${COLOR_VERBS}\\s+chain\\s+([A-Za-z])\\s+(?:to\\s+)?([a-z#0-9]+)$`, 'i'));
  if (chain) {
    return {
      name: 'color_selection',
      arguments: { target: { kind: 'chain', chain: chain[1].toUpperCase() }, color: chain[2].toLowerCase() },
    };
  }

  const residue = t.match(new RegExp(`^${COLOR_VERBS}\\s+([A-Za-z]{1,3})\\s+(?:to\\s+)?([a-z#0-9]+)(?:.*chain\\s+([A-Za-z]))?$`, 'i'));
  if (residue) {
    return {
      name: 'color_selection',
      arguments: {
        target: {
          kind: 'residue',
          residue: normalizeResidue(residue[1]),
          ...(residue[3] ? { chain: residue[3].toUpperCase() } : {}),
        },
        color: residue[2].toLowerCase(),
      },
    };
  }

  const genericColor = t.match(new RegExp(`^${COLOR_VERBS}\\s+(.+?)\\s+(?:to\\s+)?([a-z#0-9]+)$`, 'i'));
  if (genericColor) {
    const target = parseTarget(genericColor[1], selectionTag);
    if (target) {
      return { name: 'color_selection', arguments: { target, color: genericColor[2].toLowerCase() } };
    }
  }

  return null;
}
