import type { Node } from '@xyflow/react';
import type { Subnet } from '../../../shared/types/network';

/**
 * Subnet grid geometry: children snap to cells of a fixed-size grid with a
 * padded origin and a header strip at the top of the subnet card.
 */
export const GRID = {
  cellW: 340,
  cellH: 190,
  pad: 60,
  headerH: 70,
} as const;

/** Outer pixel dimensions of a subnet card for a given grid size. */
export function subnetSize(columns: number, rows: number): { width: number; height: number } {
  return {
    width: columns * GRID.cellW,
    height: GRID.headerH + rows * GRID.cellH,
  };
}

/** Recursively calculate absolute coordinates of a node by walking up its parent chain. */
export function getAbsoluteCoordinates(nodeId: string, currentNodes: Node[]): { x: number; y: number } {
  const node = currentNodes.find(n => n.id === nodeId);
  if (!node) return { x: 0, y: 0 };
  if (!node.parentId) return node.position;
  const parentPos = getAbsoluteCoordinates(node.parentId, currentNodes);
  return {
    x: parentPos.x + node.position.x,
    y: parentPos.y + node.position.y,
  };
}

/** First subnet whose bounds contain the given absolute point, or null. */
export function findSubnetAtPoint(
  point: { x: number; y: number },
  subnets: Subnet[],
  excludeId?: string
): Subnet | null {
  for (const subnet of subnets) {
    if (subnet.id === excludeId) continue;
    if (
      point.x >= subnet.position.x &&
      point.x <= subnet.position.x + subnet.width &&
      point.y >= subnet.position.y &&
      point.y <= subnet.position.y + subnet.height
    ) {
      return subnet;
    }
  }
  return null;
}

/** Nearest grid cell for a subnet-relative position (may be out of bounds). */
export function positionToCell(pos: { x: number; y: number }): { col: number; row: number } {
  return {
    col: Math.round((pos.x - GRID.pad) / GRID.cellW),
    row: Math.round((pos.y - GRID.pad) / GRID.cellH),
  };
}

/** Subnet-relative position of a grid cell's snap point. */
export function cellToPosition(col: number, row: number): { x: number; y: number } {
  return {
    x: GRID.pad + col * GRID.cellW,
    y: GRID.pad + row * GRID.cellH,
  };
}

/** Snap a subnet-relative position to the nearest cell, clamped inside the grid. */
export function clampToCell(
  rel: { x: number; y: number },
  columns: number,
  rows: number
): { x: number; y: number } {
  const { col, row } = positionToCell(rel);
  return cellToPosition(
    Math.max(0, Math.min(columns - 1, col)),
    Math.max(0, Math.min(rows - 1, row))
  );
}

/**
 * Resolve where a subnet child should sit: keep its saved cell when it is
 * still inside the grid, otherwise take the first free cell (row-major).
 * Falls back to (0, 0) when the grid is full.
 */
export function resolveSubnetChildPosition(args: {
  savedPos: { x: number; y: number } | undefined;
  columns: number;
  rows: number;
  occupiedCells: Array<{ col: number; row: number }>;
}): { x: number; y: number } {
  const { savedPos, columns, rows, occupiedCells } = args;

  let col = -1;
  let row = -1;
  if (savedPos) {
    ({ col, row } = positionToCell(savedPos));
  }

  if (col < 0 || col >= columns || row < 0 || row >= rows) {
    let found = false;
    for (let r = 0; r < rows && !found; r++) {
      for (let c = 0; c < columns && !found; c++) {
        if (!occupiedCells.some(cell => cell.col === c && cell.row === r)) {
          col = c;
          row = r;
          found = true;
        }
      }
    }
    if (!found) {
      col = 0;
      row = 0;
    }
  }

  return cellToPosition(col, row);
}
