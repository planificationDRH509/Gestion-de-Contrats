export type SpreadsheetCellPosition = {
  rowKey: string;
  columnIndex: number;
};

export function getNextSpreadsheetCell(
  rowOrder: readonly string[],
  rowKey: string,
  columnIndex: number,
  columnCount: number
): SpreadsheetCellPosition | null {
  const rowIndex = rowOrder.indexOf(rowKey);
  if (rowIndex < 0 || columnIndex < 0 || columnIndex >= columnCount || columnCount < 1) {
    return null;
  }

  if (columnIndex < columnCount - 1) {
    return { rowKey, columnIndex: columnIndex + 1 };
  }

  const nextRowKey = rowOrder[rowIndex + 1];
  return nextRowKey ? { rowKey: nextRowKey, columnIndex: 0 } : null;
}
