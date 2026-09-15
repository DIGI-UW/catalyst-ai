import { Select, SelectItem } from "@carbon/react";
import { Disclosure } from "./Disclosure";
import type { DashboardPresentationKind, WidgetAggregation } from "../types";

interface Props {
  columns: Record<string, unknown>[];
  kind: DashboardPresentationKind;
  value: WidgetAggregation;
  disabled: boolean;
  onChange: (value: WidgetAggregation) => void;
  presentations: { value: DashboardPresentationKind; label: string }[];
  onKindChange: (kind: DashboardPresentationKind) => void;
}

export function ImportedChartControls({ columns, kind, value, disabled, onChange, presentations, onKindChange }: Props) {
  const numeric = columns.filter(column => ["integer", "decimal"].includes(String(column.logicalType)));
  const temporal = kind.startsWith("time_series");
  const groups = temporal ? columns.filter(column => ["date", "date-time"].includes(String(column.logicalType))) : columns;
  const options = (items: Record<string, unknown>[]) => items.map(column => <SelectItem key={String(column.ordinal)} value={String(column.ordinal)} text={String(column.name)} />);
  return <>
    <div className="builder-summary-controls">
      <Select id="builder-import-display" labelText="Display as" value={kind} disabled={disabled} onChange={event => onKindChange(event.currentTarget.value as DashboardPresentationKind)}>
        {presentations.map(item => <SelectItem key={item.value} value={item.value} text={item.label} />)}
      </Select>
      {kind !== "table" && <>
      <Select id="builder-summary-operation" labelText="Show" value={value.operation} disabled={disabled}
        onChange={event => {
          const operation = event.currentTarget.value as WidgetAggregation["operation"];
          onChange({ ...value, operation, valueColumnOrdinal: operation === "count" ? undefined : value.valueColumnOrdinal ?? Number(numeric[0]?.ordinal) });
        }}>
        <SelectItem value="count" text="Number of records" />
        {numeric.length > 0 && <SelectItem value="sum" text="Total" />}
        {numeric.length > 0 && <SelectItem value="average" text="Average" />}
      </Select>
      {value.operation !== "count" && <Select id="builder-summary-value" labelText="Of" value={String(value.valueColumnOrdinal ?? "")} disabled={disabled}
        onChange={event => onChange({ ...value, valueColumnOrdinal: Number(event.currentTarget.value) })}>
        {options(numeric)}
      </Select>}
      {kind !== "big_number" && <Select id="builder-summary-group" labelText="For each" value={String(value.groupColumnOrdinal ?? "")} disabled={disabled}
        onChange={event => onChange({ ...value, groupColumnOrdinal: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value), seriesColumnOrdinal: undefined })}>
        {!temporal && <SelectItem value="" text="All records" />}
        {options(groups)}
      </Select>}
      </>}
    </div>
      {kind !== "table" && kind !== "big_number" && value.groupColumnOrdinal !== undefined && <Disclosure title="Split into series" open={kind === "proportion_bar" || value.seriesColumnOrdinal !== undefined ? true : undefined}><Select id="builder-summary-series" labelText="Split by" value={String(value.seriesColumnOrdinal ?? "")} disabled={disabled}
        onChange={event => onChange({ ...value, seriesColumnOrdinal: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value) })}>
        <SelectItem value="" text={kind === "proportion_bar" ? "Choose a split column" : "No split"} />
        {options(columns.filter(column => column.ordinal !== value.groupColumnOrdinal))}
      </Select></Disclosure>}
    <p className="builder-empty-note">{kind === "table" ? "Keep every original row and column. No grouping or calculation is applied." : value.operation === "count"
      ? "Every row counts, including repeated records and rows with blank values."
      : "Blank numeric values are excluded. Text values and identifiers are never converted for a calculation."}</p>
    {kind !== "table" && !numeric.length && <p className="builder-empty-note">This file has no Number columns. Mixed results stay as Text; you can still count records.</p>}
    <p className="builder-empty-note">Uses the complete saved file. Superset renders the chart after publication.</p>
  </>;
}
