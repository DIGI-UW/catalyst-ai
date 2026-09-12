import { ChevronDown } from "@carbon/icons-react";
import type { ComponentProps, ReactNode } from "react";
import "./Disclosure.css";

type DisclosureProps = Omit<ComponentProps<"details">, "title"> & {
  title: ReactNode;
};

/** Native disclosure behavior with the Workbench's shared control treatment. */
export const Disclosure = ({ title, children, className = "", onKeyDown, ...props }: DisclosureProps) => (
  <details {...props} className={`workbench-disclosure ${className}`}
    onKeyDown={(event) => {
      onKeyDown?.(event);
      if (event.key === "Escape" && !event.defaultPrevented && event.currentTarget.open) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
    <summary><span>{title}</span><ChevronDown size={16} aria-hidden="true" /></summary>
    {children}
  </details>
);
