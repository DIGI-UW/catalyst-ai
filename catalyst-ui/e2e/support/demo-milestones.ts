import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/*
 * Records when each demo milestone happened, so a published cut's timeline
 * can be authored from measurement instead of by scrubbing the capture by
 * hand. `specs/demo-video-recording-guide.md` step 2 used to say "note the
 * wall-clock second of each turn boundary" -- doing that by eye is where a
 * cut lands two seconds after the table appears and the viewer never sees it.
 *
 * Times are seconds from the first navigation. Playwright starts recording at
 * context creation, marginally BEFORE the test body runs, so video time is
 * milestone time plus a small constant. Align the final timeline against the
 * actual capture and review the rendered cut rather than assuming zero offset.
 */
export class DemoMilestones {
  private readonly marks: { label: string; at: number }[] = [];
  private readonly origin = Date.now();

  constructor(private readonly name: string) {}

  /** Record that `label` just happened. */
  mark(label: string): void {
    this.marks.push({ label, at: (Date.now() - this.origin) / 1000 });
    console.info(`${this.name}: ${label}`);
  }

  /** Write the milestones as JSON for the timeline author to read. */
  save(): void {
    const out = resolve(
      process.env.DEMO_MILESTONES_DIR ?? "demo-milestones",
      `${this.name}.json`,
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify(
        { name: this.name, testDuration: (Date.now() - this.origin) / 1000, marks: this.marks },
        null,
        2,
      ),
      "utf-8",
    );
  }
}
