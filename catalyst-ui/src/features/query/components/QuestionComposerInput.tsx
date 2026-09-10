import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import "./QuestionComposerInput.css";

interface QuestionComposerInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  disabled?: boolean;
  autoFocus?: boolean;
  submitDisabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

let visitHeight: number | null = null;

const expandedHeight = () => {
  const widthCap = window.innerWidth <= 672 ? 280 : 360;
  return Math.max(72, Math.min(widthCap, window.innerHeight * 0.4));
};

export const QuestionComposerInput = ({
  id,
  label,
  placeholder,
  value,
  disabled = false,
  autoFocus = false,
  submitDisabled,
  onChange,
  onSubmit,
}: QuestionComposerInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoreHeight = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (visitHeight) textarea.style.height = `${visitHeight}px`;

    const dock = textarea.closest<HTMLElement>("[data-query-composer-dock]");
    const recordMeasurements = () => {
      const height = textarea.getBoundingClientRect().height;
      if (height >= 72 && !expanded) visitHeight = height;
      if (dock) {
        document.documentElement.style.setProperty(
          "--query-composer-dock-height",
          `${dock.getBoundingClientRect().height}px`,
        );
      }
    };
    recordMeasurements();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(recordMeasurements);
    observer.observe(textarea);
    if (dock) observer.observe(dock);
    return () => observer.disconnect();
  }, [expanded]);

  const toggleExpanded = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selection = [textarea.selectionStart, textarea.selectionEnd] as const;
    if (expanded) {
      const height = restoreHeight.current ?? visitHeight ?? 96;
      textarea.style.height = `${height}px`;
      visitHeight = height;
    } else {
      restoreHeight.current = textarea.getBoundingClientRect().height || visitHeight || 96;
      textarea.style.height = `${expandedHeight()}px`;
    }
    setExpanded((current) => !current);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(...selection);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (!submitDisabled) onSubmit();
  };

  return (
    <div className="question-composer-input">
      <div className="question-composer-input__heading">
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          className="question-composer-input__size"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={toggleExpanded}
        >
          {expanded ? "Restore" : "Expand"}
        </button>
      </div>
      <textarea
        id={id}
        ref={textareaRef}
        rows={3}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onKeyDown={handleKeyDown}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
};
