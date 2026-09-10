import { ArrowRight } from "@carbon/icons-react";
import { Button, Form, Select, SelectItem } from "@carbon/react";
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
  profiles?: QueryProfile[];
  selectedProfileId?: string;
  onProfileChange?: (profileId: string) => void;
}

const profileModelAliases = (profile: QueryProfile) =>
  Array.from(
    new Set(
      Object.entries(profile.roleModels)
        .sort(([leftRole], [rightRole]) =>
          leftRole < rightRole ? -1 : leftRole > rightRole ? 1 : 0,
        )
        .map(([, modelAlias]) => modelAlias.trim())
        .filter(Boolean),
    ),
  );

export const QuestionForm = ({
  advancedMode = false,
  question,
  busy,
  retry = false,
  disabled = false,
  onQuestionChange,
  onSubmit,
  profiles = [],
  selectedProfileId,
  onProfileChange,
}: QuestionFormProps) => {
  const normalizedQuestion = question.trim();
  const availableProfiles = profiles.filter((profile) => profile.available);
  const selectedAliases = profileModelAliases(
    availableProfiles.find((profile) => profile.id === selectedProfileId) ??
      availableProfiles[0] ?? { roleModels: {} } as QueryProfile,
  );

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
              <details className="query-settings" open={advancedMode}>
                <summary>Query settings</summary>
              <Select
                id="catalyst-profile"
                className="query-composer__profile"
                labelText="Model profile"
                size="sm"
                value={selectedProfileId}
                disabled={busy || disabled}
                helperText={
                  selectedAliases.length > 0
                    ? selectedAliases.join(" · ")
                    : undefined
                }
                onChange={(event) => onProfileChange?.(event.currentTarget.value)}
              >
                {availableProfiles.map((profile) => (
                  /*
                   * profile.label already names the models in prose ("Gemma 4
                   * 12B writer, Qwen 2.5 14B reviewer"); appending the aliases
                   * repeated it in slug form and overflowed the control. The
                   * aliases are disclosed under the field instead.
                   */
                  <SelectItem
                    key={profile.id}
                    value={profile.id}
                    text={profile.label}
                  />
                ))}
              </Select>
              </details>
            )}
            {profiles.length > 0 && availableProfiles.length === 0 && (
              <p className="query-composer__availability" role="status">
                No configured model profile is currently available.
              </p>
            )}
            <Button
              type="submit"
              renderIcon={ArrowRight}
              disabled={!normalizedQuestion || busy || disabled}
            >
              {busy ? "Preparing…" : retry ? "Retry" : "Continue"}
            </Button>
          </div>
        </div>
      </Form>
    </section>
  );
};
