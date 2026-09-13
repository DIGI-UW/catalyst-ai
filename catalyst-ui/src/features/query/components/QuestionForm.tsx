import { QuerySettings } from "./QuerySettings";
import { ArrowRight } from "@carbon/icons-react";
import { Button, Form } from "@carbon/react";
import { type FormEvent } from "react";
import type { QueryProfile } from "../types";
import { QuestionComposerInput } from "./QuestionComposerInput";

interface QuestionFormProps {
  advancedMode?: boolean;
  question: string;
  busy: boolean;
  retry?: boolean;
  disabled?: boolean;
  onQuestionChange: (question: string) => void;
  onSubmit: (question: string) => void;
  onCancel?: () => void;
  notice?: string | null;
  profiles?: QueryProfile[];
  selectedProfileId?: string;
  onProfileChange?: (profileId: string) => void;
}

export const QuestionForm = ({
  advancedMode = false,
  question,
  busy,
  retry = false,
  disabled = false,
  onQuestionChange,
  onSubmit,
  onCancel,
  notice,
  profiles = [],
  selectedProfileId,
  onProfileChange,
}: QuestionFormProps) => {
  const normalizedQuestion = question.trim();
  const availableProfiles = profiles.filter((profile) => profile.available);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizedQuestion || busy || disabled) return;
    onSubmit(normalizedQuestion);
  };

  return (
    <section
      id="ask-openelis"
      className="query-card query-card--question"
      aria-label="Query composer"
      data-query-composer-dock
    >
      <Form className="query-composer-form" onSubmit={handleSubmit}>
        <div className="query-composer">
          <QuestionComposerInput
            id="catalyst-question"
            label="Your question"
            placeholder="Describe the data you want to explore"
            value={question}
            autoFocus
            disabled={busy || disabled}
            submitDisabled={!normalizedQuestion || busy || disabled}
            onChange={onQuestionChange}
            onSubmit={() => onSubmit(normalizedQuestion)}
          />
          <div className="query-composer__toolbar">
            {availableProfiles.length > 0 && (
              <QuerySettings id="catalyst-profile" profiles={availableProfiles}
                selectedProfileId={selectedProfileId} advancedMode={advancedMode}
                disabled={busy || disabled} onProfileChange={onProfileChange} />
            )}
            {profiles.length > 0 && availableProfiles.length === 0 && (
              <p className="query-composer__availability" role="status">
                No configured model profile is currently available.
              </p>
            )}
            {busy && onCancel ? <Button type="button" kind="tertiary" onClick={(event) => {
              // Aborting can restore the submit button before this click ends.
              event.preventDefault();
              onCancel();
            }}>
              Stop preparing
            </Button> : <Button
              type="submit"
              renderIcon={ArrowRight}
              disabled={!normalizedQuestion || busy || disabled}
            >
              {busy ? "Preparing…" : retry ? "Retry" : "Continue"}
            </Button>}
          </div>
          <p className="query-composer__help" role={notice ? "status" : undefined}>
            {notice ?? "Review the request before retrieving data. Ctrl / ⌘ + Enter to continue."}
          </p>
        </div>
      </Form>
    </section>
  );
};
