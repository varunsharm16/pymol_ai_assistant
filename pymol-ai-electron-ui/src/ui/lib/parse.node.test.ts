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

test('parses sequence view format command', () => {
  assert.deepEqual(parsePromptToSpec('Show sequence as residue names'), {
    name: 'set_sequence_view_format',
    arguments: { format: 'residue_names' },
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

test('parses measure distance between selected', () => {
  assert.deepEqual(parsePromptToSpec('measure distance between selected'), {
    name: 'measure_distance',
    arguments: {
      source: { kind: 'current_selection' },
      target: { kind: 'current_selection' },
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
