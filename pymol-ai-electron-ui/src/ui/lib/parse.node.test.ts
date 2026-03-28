import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePromptToSpec } from './parse.js';

test('parses remove waters', () => {
  assert.deepEqual(parsePromptToSpec('Remove waters'), {
    name: 'remove_selection',
    arguments: { target: { kind: 'water' } },
  });
});

test('parses show ligand as sticks', () => {
  assert.deepEqual(parsePromptToSpec('Show ligand as sticks'), {
    name: 'show_representation',
    arguments: {
      target: { kind: 'ligand' },
      representation: 'sticks',
    },
  });
});

test('parses cartoon representation of the molecule', () => {
  assert.deepEqual(parsePromptToSpec('Show the cartoon representation of the molecule'), {
    name: 'show_representation',
    arguments: {
      target: { kind: 'all' },
      representation: 'cartoon',
    },
  });
});

test('parses display surface on protein deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Display surface on protein'), {
    name: 'show_representation',
    arguments: {
      target: { kind: 'protein' },
      representation: 'surface',
    },
  });
});

test('parses hide surface for ligand deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Hide surface for ligand'), {
    name: 'hide_representation',
    arguments: {
      target: { kind: 'ligand' },
      representation: 'surface',
    },
  });
});

test('parses sequence view format command', () => {
  assert.deepEqual(parsePromptToSpec('Show sequence as residue names'), {
    name: 'set_sequence_view_format',
    arguments: { format: 'residue_names' },
  });
});

test('parses deferred contacts command without dropping support', () => {
  assert.deepEqual(
    parsePromptToSpec('Show polar contacts between ligand and residue ASP in chain B'),
    {
      name: 'show_contacts',
      arguments: {
        source: { kind: 'ligand' },
        target: { kind: 'residue', residue: 'ASP', chain: 'B' },
        mode: 'polar',
      },
    }
  );
});

test('parses deferred align command without dropping support', () => {
  assert.deepEqual(parsePromptToSpec('Align object ligand_pose to object receptor'), {
    name: 'align_objects',
    arguments: {
      mobile: { kind: 'object', object: 'ligand_pose' },
      target: { kind: 'object', object: 'receptor' },
      method: 'align',
    },
  });
});

test('parses transparency on protein', () => {
  assert.deepEqual(parsePromptToSpec('Set surface transparency to 0.4 on protein'), {
    name: 'set_transparency',
    arguments: {
      target: { kind: 'protein' },
      representation: 'surface',
      value: 0.4,
    },
  });
});

test('parses fade surface transparency phrasing', () => {
  assert.deepEqual(parsePromptToSpec('Fade surface on protein to 40% transparent'), {
    name: 'set_transparency',
    arguments: {
      target: { kind: 'protein' },
      representation: 'surface',
      value: 0.4,
    },
  });
});

test('parses make target representation transparent phrasing', () => {
  assert.deepEqual(parsePromptToSpec('Make chain B surface transparent 0.25'), {
    name: 'set_transparency',
    arguments: {
      target: { kind: 'chain', chain: 'B' },
      representation: 'surface',
      value: 0.25,
    },
  });
});

test('parses measure distance between ligand and residue', () => {
  assert.deepEqual(
    parsePromptToSpec('Measure distance between ligand and residue ASP in chain B'),
    {
      name: 'measure_distance',
      arguments: {
        source: { kind: 'ligand' },
        target: { kind: 'residue', residue: 'ASP', chain: 'B' },
      },
    }
  );
});

test('parses measure distance from X to Y phrasing', () => {
  assert.deepEqual(
    parsePromptToSpec('Measure the distance from ligand to residue ASP in chain B'),
    {
      name: 'measure_distance',
      arguments: {
        source: { kind: 'ligand' },
        target: { kind: 'residue', residue: 'ASP', chain: 'B' },
      },
    }
  );
});

test('parses measure distance between selected', () => {
  assert.deepEqual(parsePromptToSpec('measure distance between selected'), {
    name: 'measure_distance',
    arguments: {
      source: { kind: 'current_selection' },
      target: { kind: 'current_selection' },
    },
  });
});

test('parses clear labels deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Clear labels'), {
    name: 'clear_labels',
    arguments: {},
  });
});

test('parses clear selected label deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Clear selected label'), {
    name: 'clear_labels',
    arguments: {
      target: { kind: 'active_selection' },
    },
  });
});

test('parses clear labels on selected deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Clear labels on selected'), {
    name: 'clear_labels',
    arguments: {
      target: { kind: 'active_selection' },
    },
  });
});

test('parses full residue family coloring', () => {
  assert.deepEqual(parsePromptToSpec('Color all leucine residues orange'), {
    name: 'color_selection',
    arguments: {
      target: { kind: 'residue', residue: 'LEU' },
      color: 'orange',
    },
  });
});

test('parses color all chains grey as all-target coloring', () => {
  assert.deepEqual(parsePromptToSpec('Color all chains grey'), {
    name: 'color_selection',
    arguments: {
      target: { kind: 'all' },
      color: 'grey',
    },
  });
});

test('parses residue family coloring with full name and code', () => {
  assert.deepEqual(parsePromptToSpec('Colour serine (SER) residues in chain A #FF00FF'), {
    name: 'color_selection',
    arguments: {
      target: { kind: 'residue', residue: 'SER', chain: 'A' },
      color: '#ff00ff',
    },
  });
});

test('returns null for compound prompts', () => {
  assert.equal(parsePromptToSpec('Remove waters and show ligand as sticks'), null);
});

test('parses current selection tag with provided context', () => {
  assert.deepEqual(
    parsePromptToSpec('Color @A:ALA21 red', {
      selectionTag: {
        label: '@A:ALA21',
        target: { kind: 'residue', residue: 'ALA', resi: '21', chain: 'A', object: '1crn' },
      },
    }),
    {
      name: 'color_selection',
      arguments: {
        target: { kind: 'residue', residue: 'ALA', resi: '21', chain: 'A', object: '1crn' },
        color: 'red',
      },
    }
  );
});

test('parses label all residues in chain B deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Label all residues in chain B'), {
    name: 'label_selection',
    arguments: {
      target: { kind: 'chain', chain: 'B' },
      mode: 'residue',
    },
  });
});

test('does not parse orient prompts anymore', () => {
  assert.equal(parsePromptToSpec('Orient target on chain B'), null);
});

test('parses make selected red deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Make selected red'), {
    name: 'color_selection',
    arguments: {
      target: { kind: 'active_selection' },
      color: 'red',
    },
  });
});

test('parses turn selected black deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Turn selected black'), {
    name: 'color_selection',
    arguments: {
      target: { kind: 'active_selection' },
      color: 'black',
    },
  });
});

test('parses highlight selected yellow deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Highlight selected yellow'), {
    name: 'color_selection',
    arguments: {
      target: { kind: 'active_selection' },
      color: 'yellow',
    },
  });
});

test('parses make background white deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Make the background white'), {
    name: 'set_background',
    arguments: {
      color: 'white',
    },
  });
});

test('parses take a pic named figure.png deterministically', () => {
  assert.deepEqual(parsePromptToSpec('Take a pic named figure.png'), {
    name: 'snapshot',
    arguments: {
      filename: 'figure.png',
    },
  });
});
