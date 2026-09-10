import { ArrowDown, ArrowUp } from "@carbon/icons-react";
import { Button, Select, SelectItem } from "@carbon/react";
import type { DashboardBuilderEntity } from "../types";
import "./DashboardArrangement.css";

export type ChartWidth = 4 | 6 | 12;

interface DashboardArrangementProps {
  widgets: DashboardBuilderEntity[];
  widths: Record<string, ChartWidth>;
  disabled?: boolean;
  onMove?: (versionId: string, direction: -1 | 1) => void;
  onWidthChange?: (versionId: string, width: ChartWidth) => void;
}

export const DashboardArrangement = ({ widgets, widths, disabled, onMove, onWidthChange }: DashboardArrangementProps) => (
  <div className="dashboard-arrangement">
    <div className="dashboard-arrangement__preview" role="img" aria-label="Dashboard layout preview">
      {widgets.map(widget => <div key={widget.versionId}
        style={{ gridColumn: `span ${widths[widget.versionId] ?? 12}` }}>
        {String(widget.configuration.title ?? "Chart")}
      </div>)}
    </div>
    {onMove && onWidthChange && <>
      <p>Move charts into reading order and choose how much of each row they use.</p>
      <ol className="dashboard-arrangement__controls">
        {widgets.map((widget, index) => {
          const title = String(widget.configuration.title ?? "Chart");
          return <li key={widget.versionId}>
            <strong>{title}</strong>
            <div className="dashboard-arrangement__actions">
              <div className="dashboard-arrangement__move">
              <Button kind="ghost" hasIconOnly renderIcon={ArrowUp}
                iconDescription={`Move ${title} earlier`} disabled={disabled || index === 0}
                onClick={() => onMove(widget.versionId, -1)} />
              <Button kind="ghost" hasIconOnly renderIcon={ArrowDown}
                iconDescription={`Move ${title} later`} disabled={disabled || index === widgets.length - 1}
                onClick={() => onMove(widget.versionId, 1)} />
              </div>
              <Select id={`chart-width-${widget.versionId}`} labelText={`Width of ${title}`}
                value={widths[widget.versionId] ?? 12} disabled={disabled}
                onChange={event => onWidthChange(widget.versionId, Number(event.currentTarget.value) as ChartWidth)}>
                <SelectItem value={12} text="Full row" />
                <SelectItem value={6} text="Half row" />
                <SelectItem value={4} text="Third of a row" />
              </Select>
            </div>
          </li>;
        })}
      </ol>
    </>}
  </div>
);
