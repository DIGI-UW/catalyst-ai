import { Accordion, AccordionItem } from "@carbon/react";
import type { CatalystTable } from "../types";

interface ProvenancePanelProps {
  result: CatalystTable;
}

export const ProvenancePanel = ({ result }: ProvenancePanelProps) => (
  <section
    className="query-card provenance"
    aria-label="Provenance"
    aria-labelledby="provenance-title"
  >
    <div className="section-heading">
      <p className="eyebrow">Reproducibility metadata</p>
      <h2 id="provenance-title">Provenance</h2>
    </div>
    <Accordion align="start">
      <AccordionItem title="Source and freshness" open>
        <dl className="provenance-grid">
          <div>
            <dt>Data source</dt>
            <dd>{result.source.dataSource}</dd>
          </div>
          <div>
            <dt>Catalog version</dt>
            <dd>{result.source.catalogVersion}</dd>
          </div>
          <div>
            <dt>Views</dt>
            <dd>{result.source.views.join(", ")}</dd>
          </div>
          <div>
            <dt>SQL dialect</dt>
            <dd>{result.source.freshness.dialect}</dd>
          </div>
          <div>
            <dt>Readable relations</dt>
            <dd>{result.source.freshness.relationCount}</dd>
          </div>
        </dl>
      </AccordionItem>
      <AccordionItem title="Execution and traces" open>
        <dl className="provenance-grid">
          <div>
            <dt>Profile</dt>
            <dd>{result.provenance.profileId}</dd>
          </div>
          <div>
            <dt>Catalyst trace</dt>
            <dd>{result.provenance.catalystTraceId}</dd>
          </div>
          <div>
            <dt>Hub trace</dt>
            <dd>{result.provenance.hubTraceId}</dd>
          </div>
          <div>
            <dt>Preview</dt>
            <dd>{result.preview.previewId}</dd>
          </div>
          <div>
            <dt>Query digest</dt>
            <dd>{result.preview.queryDigest}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{result.execution.durationMs} ms</dd>
          </div>
          <div>
            <dt>Statement timeout</dt>
            <dd>{result.execution.statementTimeoutMs} ms</dd>
          </div>
        </dl>
      </AccordionItem>
    </Accordion>
  </section>
);
