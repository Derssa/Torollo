import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import type { Subnet } from '../../../shared/types/network';
import {
  GRID,
  subnetSize,
  getAbsoluteCoordinates,
  findSubnetAtPoint,
  positionToCell,
  cellToPosition,
  clampToCell,
  resolveSubnetChildPosition,
} from './canvasGeometry';

function subnet(overrides: Partial<Subnet> & { id: string }): Subnet {
  return {
    name: overrides.id,
    type: 'public',
    vpcId: 'root-vpc',
    position: { x: 0, y: 0 },
    width: 680,
    height: 260,
    routes: [],
    ...overrides,
  };
}

function node(overrides: Partial<Node> & { id: string }): Node {
  return {
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as Node;
}

describe('subnetSize', () => {
  it('computes outer dimensions from the grid size', () => {
    expect(subnetSize(2, 1)).toEqual({ width: 2 * GRID.cellW, height: GRID.headerH + GRID.cellH });
    expect(subnetSize(3, 2)).toEqual({ width: 1020, height: 450 });
  });
});

describe('getAbsoluteCoordinates', () => {
  it('returns the node position when it has no parent', () => {
    const nodes = [node({ id: 'a', position: { x: 10, y: 20 } })];
    expect(getAbsoluteCoordinates('a', nodes)).toEqual({ x: 10, y: 20 });
  });

  it('accumulates positions through nested parents', () => {
    const nodes = [
      node({ id: 'grandparent', position: { x: 100, y: 200 } }),
      node({ id: 'parent', position: { x: 30, y: 40 }, parentId: 'grandparent' }),
      node({ id: 'child', position: { x: 5, y: 6 }, parentId: 'parent' }),
    ];
    expect(getAbsoluteCoordinates('child', nodes)).toEqual({ x: 135, y: 246 });
  });

  it('returns the origin for an unknown node', () => {
    expect(getAbsoluteCoordinates('missing', [])).toEqual({ x: 0, y: 0 });
  });
});

describe('findSubnetAtPoint', () => {
  const subnets = [
    subnet({ id: 'sub-1', position: { x: 0, y: 0 }, width: 680, height: 260 }),
    subnet({ id: 'sub-2', position: { x: 1000, y: 0 }, width: 680, height: 260 }),
  ];

  it('returns the subnet containing the point', () => {
    expect(findSubnetAtPoint({ x: 50, y: 50 }, subnets)?.id).toBe('sub-1');
    expect(findSubnetAtPoint({ x: 1100, y: 100 }, subnets)?.id).toBe('sub-2');
  });

  it('treats subnet edges as inside', () => {
    expect(findSubnetAtPoint({ x: 0, y: 0 }, subnets)?.id).toBe('sub-1');
    expect(findSubnetAtPoint({ x: 680, y: 260 }, subnets)?.id).toBe('sub-1');
  });

  it('returns null when no subnet contains the point', () => {
    expect(findSubnetAtPoint({ x: 800, y: 50 }, subnets)).toBeNull();
  });

  it('skips the excluded subnet (self hit-test while dragging)', () => {
    expect(findSubnetAtPoint({ x: 50, y: 50 }, subnets, 'sub-1')).toBeNull();
  });
});

describe('positionToCell / cellToPosition', () => {
  it('round-trips a cell through its snap position', () => {
    expect(positionToCell(cellToPosition(0, 0))).toEqual({ col: 0, row: 0 });
    expect(positionToCell(cellToPosition(2, 3))).toEqual({ col: 2, row: 3 });
  });

  it('maps a position near a cell to that cell', () => {
    const snap = cellToPosition(1, 1);
    expect(positionToCell({ x: snap.x + 40, y: snap.y - 30 })).toEqual({ col: 1, row: 1 });
  });
});

describe('clampToCell', () => {
  it('snaps an in-bounds position to its nearest cell', () => {
    expect(clampToCell(cellToPosition(1, 0), 2, 1)).toEqual(cellToPosition(1, 0));
  });

  it('clamps positions beyond the grid to the last cell', () => {
    expect(clampToCell({ x: 5000, y: 5000 }, 2, 1)).toEqual(cellToPosition(1, 0));
  });

  it('clamps negative positions to the first cell', () => {
    expect(clampToCell({ x: -500, y: -500 }, 2, 1)).toEqual(cellToPosition(0, 0));
  });
});

describe('resolveSubnetChildPosition', () => {
  it('keeps a saved position that maps to a valid cell', () => {
    expect(
      resolveSubnetChildPosition({
        savedPos: cellToPosition(1, 0),
        columns: 2,
        rows: 1,
        occupiedCells: [],
      })
    ).toEqual(cellToPosition(1, 0));
  });

  it('keeps a valid saved cell even when that cell is occupied (no eviction)', () => {
    expect(
      resolveSubnetChildPosition({
        savedPos: cellToPosition(0, 0),
        columns: 2,
        rows: 1,
        occupiedCells: [{ col: 0, row: 0 }],
      })
    ).toEqual(cellToPosition(0, 0));
  });

  it('assigns the first free cell (row-major) when there is no saved position', () => {
    expect(
      resolveSubnetChildPosition({
        savedPos: undefined,
        columns: 2,
        rows: 2,
        occupiedCells: [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
        ],
      })
    ).toEqual(cellToPosition(0, 1));
  });

  it('reassigns an out-of-bounds saved position to the first free cell', () => {
    expect(
      resolveSubnetChildPosition({
        savedPos: cellToPosition(5, 5),
        columns: 2,
        rows: 1,
        occupiedCells: [{ col: 0, row: 0 }],
      })
    ).toEqual(cellToPosition(1, 0));
  });

  it('falls back to the origin cell when the grid is full', () => {
    expect(
      resolveSubnetChildPosition({
        savedPos: undefined,
        columns: 1,
        rows: 1,
        occupiedCells: [{ col: 0, row: 0 }],
      })
    ).toEqual(cellToPosition(0, 0));
  });
});
