import { SettingsAdjust } from "@carbon/icons-react";
import { Button, Modal, Select, SelectItem } from "@carbon/react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { QueryProfile } from "../types";
import { Disclosure } from "./Disclosure";
import "./QuerySettings.css";

interface QuerySettingsProps {
  id: string;
  profiles: QueryProfile[];
  selectedProfileId?: string;
  disabled?: boolean;
  advancedMode?: boolean;
  onProfileChange?: (profileId: string) => void;
}

export const QuerySettings = ({
  id, profiles, selectedProfileId, disabled, advancedMode = false, onProfileChange,
}: QuerySettingsProps) => {
  const [open, setOpen] = useState(false);
  const [portal, setPortal] = useState<Element | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const selected = profiles.find(profile => profile.id === selectedProfileId);

  return <>
    <Button ref={launcher} type="button" kind="ghost" size="sm"
      className="query-settings-button" renderIcon={SettingsAdjust}
      aria-haspopup="dialog" onClick={event => {
        // Keep the dialog outside the transformed, scrolling composer but inside its theme.
        setPortal(event.currentTarget.closest(".application") ?? document.body);
        setOpen(true);
      }}>
      Query settings
    </Button>
    {portal && createPortal(<Modal open={open} size="sm" className="query-settings-dialog"
      modalHeading="Query settings" primaryButtonText="Done"
      launcherButtonRef={launcher} selectorPrimaryFocus={`#${id}`}
      onRequestClose={() => setOpen(false)} onRequestSubmit={() => setOpen(false)}>
      <p>Choose how Catalyst prepares your next question. Changing this setting does not run a query.</p>
      <Select id={id} labelText="Model profile" value={profiles.length ? selectedProfileId : ""}
        disabled={disabled || profiles.length === 0}
        onChange={event => onProfileChange?.(event.currentTarget.value)}>
        {profiles.length === 0 && <SelectItem value="" text="No question service available" />}
        {profiles.map(profile => <SelectItem key={profile.id} value={profile.id} text={profile.label} />)}
      </Select>
      {selected && <Disclosure title="Model details" open={advancedMode}>
        <dl>{Object.entries(selected.roleModels).map(([role, model]) =>
          <div key={role}><dt>{role === "query_generate" ? "Writer" : role === "query_review" ? "Reviewer" : role}</dt><dd>{model}</dd></div>,
        )}</dl>
      </Disclosure>}
    </Modal>, portal)}
  </>;
};
