/** Details use a full-width panel on narrow screens. */
export const NARROW_WORKSPACE_BREAKPOINT = 672;

export type WorkspaceSection = "data" | "turns";

export interface WorkspaceTurn {
  ordinal: number;
  instruction: string;
  status: "succeeded" | "failed" | "not-run";
  current: boolean;
}
