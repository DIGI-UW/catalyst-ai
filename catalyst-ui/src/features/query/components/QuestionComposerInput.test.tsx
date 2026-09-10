import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionComposerInput } from "./QuestionComposerInput";

const renderInput = (overrides = {}) => {
  const props = {
    id: "question",
    label: "Your question",
    placeholder: "Describe what you need",
    value: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight",
    submitDisabled: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  return { ...render(<QuestionComposerInput {...props} />), props };
};

describe("QuestionComposerInput", () => {
  it("uses Enter for a newline and the modifier shortcut once for preparation", async () => {
    const user = userEvent.setup();
    const { props } = renderInput({ value: "" });
    const input = screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement;

    await user.type(input, "first{enter}second");
    expect(props.onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(props.onSubmit).toHaveBeenCalledTimes(2);
  });

  it("expands and restores without losing the draft, selection, or focus", async () => {
    const user = userEvent.setup();
    renderInput();
    const input = screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement;
    Object.defineProperty(input, "getBoundingClientRect", {
      value: () => ({ height: 96 }),
    });
    input.focus();
    input.setSelectionRange(4, 7);

    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(input).toHaveValue("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight");
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.selectionStart).toBe(4);
    expect(input.selectionEnd).toBe(7);
    expect(screen.getByRole("button", { name: "Restore" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(input).toHaveStyle({ height: "96px" });
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("keeps preparation disabled without discarding the draft", async () => {
    const user = userEvent.setup();
    const { props } = renderInput({ submitDisabled: true });
    const input = screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement;
    input.focus();

    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight");
  });
});
