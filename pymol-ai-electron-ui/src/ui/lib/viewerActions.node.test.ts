import test from 'node:test';
import assert from 'node:assert/strict';

import { updateViewerStateAfterCommand, restoreViewerState } from './viewerActions.js';
import { useStore, type ViewerState } from '../store.js';

const residueA = { kind: 'residue', residue: 'ALA', resi: '21', chain: 'A', object: '1crn' } as const;
const residueB = { kind: 'residue', residue: 'GLY', resi: '22', chain: 'A', object: '1crn' } as const;

function resetUiState() {
  useStore.setState({
    currentViewerSelection: residueB as any,
    activeViewerSelections: [residueA, residueB] as any,
    selectedResiduePair: [residueA, residueB] as any,
    sequenceUi: { open: false, mode: 'single' },
  });
}

test('persisted state materializes active selection and sequence ui', () => {
  resetUiState();
  useStore.setState({ sequenceUi: { open: true, mode: 'polymers' } });

  const state = updateViewerStateAfterCommand(
    undefined,
    { name: 'color_selection', arguments: { target: { kind: 'active_selection' }, color: 'blue' } },
    { backgroundColor: '#000000' }
  );

  assert.deepEqual(state.sequenceUi, { open: true, mode: 'polymers' });
  assert.equal(state.operations[0]?.name, 'color_selection');
  assert.deepEqual(state.operations[0]?.arguments?.target, {
    kind: 'selection_set',
    items: [residueA, residueB],
  });
});

test('clear measurements prunes persisted distance operations', () => {
  resetUiState();

  const current: ViewerState = {
    operations: [
      {
        name: 'measure_distance',
        arguments: { source: residueA, target: residueB },
      },
      {
        name: 'color_selection',
        arguments: { target: residueA, color: 'red' },
      },
    ],
  };

  const state = updateViewerStateAfterCommand(
    current,
    { name: 'clear_measurements', arguments: {} },
    { backgroundColor: '#111111' }
  );

  assert.deepEqual(state.operations, [
    {
      name: 'color_selection',
      arguments: { target: residueA, color: 'red' },
    },
  ]);
});

test('clear labels on selected prunes matching persisted label operations', () => {
  resetUiState();

  const current: ViewerState = {
    operations: [
      {
        name: 'label_selection',
        arguments: {
          target: { kind: 'selection_set', items: [residueA, residueB] },
          mode: 'residue',
        },
      },
      {
        name: 'label_selection',
        arguments: {
          target: { kind: 'chain', chain: 'B' },
          mode: 'residue',
        },
      },
    ],
  };

  const state = updateViewerStateAfterCommand(
    current,
    { name: 'clear_labels', arguments: { target: { kind: 'active_selection' } } },
    { backgroundColor: '#111111' }
  );

  assert.deepEqual(state.operations, [
    {
      name: 'label_selection',
      arguments: {
        target: { kind: 'chain', chain: 'B' },
        mode: 'residue',
      },
    },
  ]);
});

test('restore viewer state replays operations in stage order and applies sequence ui', async () => {
  resetUiState();
  const calls: string[] = [];

  const viewer = {
    applySceneSnapshot: async () => {
      calls.push('background');
    },
    hasStructure: () => true,
    showRepresentation: async () => {
      calls.push('show');
    },
    colorSelection: async () => {
      calls.push('color');
    },
    setTransparency: async () => {
      calls.push('transparency');
    },
    labelSelection: async () => {
      calls.push('label');
    },
    measureDistance: async () => {
      calls.push('distance');
    },
  } as any;

  const errors = await restoreViewerState(
    {
      backgroundColor: '#ffffff',
      sequenceUi: { open: true, mode: 'polymers' },
      operations: [
        { name: 'measure_distance', arguments: { source: residueA, target: residueB } },
        { name: 'label_selection', arguments: { target: residueA, mode: 'residue' } },
        { name: 'set_transparency', arguments: { target: residueA, value: 0.4, representation: 'surface' } },
        { name: 'color_selection', arguments: { target: residueA, color: 'blue' } },
        { name: 'show_representation', arguments: { target: residueA, representation: 'sticks' } },
      ],
    },
    viewer
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(calls, ['background', 'show', 'color', 'transparency', 'label', 'distance']);
  assert.deepEqual(useStore.getState().sequenceUi, { open: true, mode: 'polymers' });
});
