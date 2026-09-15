import "./TypedRowsTable.css";
import type { TaggedCell } from "../types";

export const TaggedCellValue = ({ cell }: { cell: TaggedCell | undefined }) => {
  if (!cell || cell.type === "null") {
    return <span aria-label="No value">—</span>;
  }
  if (cell.type === "string" && !cell.value.trim()) {
    return (
      <span className="workbench-execution__blank-cell" aria-label="Empty string">
        Empty string
      </span>
    );
  }
  if (cell.type === "json" || cell.type === "array") {
    return JSON.stringify(cell.value);
  }
  return String(cell.value);
};

export const TypedRowsTable = ({ columns, rows, caption = "Result rows" }: {
  columns: Array<{ ordinal: number; name: string; databaseType?: string; logicalType: string }>;
  rows: TaggedCell[][];
  caption?: string;
}) => {
  const order = columns.map((_, index) => index).sort((a, b) => columns[a]!.ordinal - columns[b]!.ordinal);
  return <div className="typed-rows workbench-execution__table-wrap workbench-execution__table-wrap--bounded" tabIndex={0} role="region" aria-label={caption}>
    <table>
      <caption>{caption}</caption>
      <thead><tr>{order.map(index => <th key={index} scope="col">
        {columns[index]!.name}<small className="workbench-execution__column-type">{columns[index]!.databaseType || columns[index]!.logicalType}</small>
      </th>)}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{order.map(index => <td key={index}><TaggedCellValue cell={row[index]} /></td>)}</tr>)}</tbody>
    </table>
  </div>;
};
