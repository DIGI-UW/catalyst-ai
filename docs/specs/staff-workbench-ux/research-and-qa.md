# Research and QA record

Reviewed 9 September 2026. This is a design proposal and expert review, not a
usability study with clinical staff and not implementation acceptance.

## Evidence boundaries

The [overlap table](overlap.md) separates existing requirements, implementation
evidence, and proposed changes. It includes pinned Catalyst and harness sources.

- **Live app observations:** earlier in this review, existing OpenELIS and
  OpenMRS HIV verification sessions were inspected in the local Catalyst app at
  revision `c0e11c733927331d9380256f60188416ed41edf8`, at 1280 × 720. No model request,
  database execution, Dataset save, or publication was made for that inspection.
- **Current source comparison:** this PR starts from Catalyst `main` at
  `4c6a46fa121ea7ce6dff7784547e2eb6aa236fa6`. Relevant UI code was rechecked for the
  overlap table. Source inspection does not prove that revision is deployed.
- **Mock checks below:** run against this directory's fictional, in-memory
  preview. Source selection, query preparation, saves, and publication buttons
  only change illustrative state. They make no application-service requests.

## Observed product friction

Both sources had a fixed 72 px follow-up field with resizing disabled. An
eight-line question needed 216 px of content height. Initial and follow-up
questions use different component implementations. The landing screen displayed
30 technical OpenELIS relation cards; the design already calls for a compact
complete-data browser. OpenMRS exposed `configured_limit` without explaining that
more rows existed and the total was unknown. Dataset review placed internal
metadata above results. Escape closed that panel but returned focus to BODY in
two observations, despite existing focus-restoration code.

The analyst editor and empty libraries were inspected. Populated Widget
arrangement, live publication/import, mobile behavior and all conversation
outcomes were **not** validated in that live-app review. The earlier viewport
override retained 1280 × 720; narrow mock checks below are a separate result.

## Research applied

Sources were checked on 9 September 2026. The proposal combines current component
guidance with established usability principles; it does not require a new
framework or claim that longstanding guidance is newly invented.

| Source | Finding used in the design |
| --- | --- |
| [Carbon: Text input and TextArea](https://carbondesignsystem.com/components/text-input/usage/) | Longer input needs a persistent label and adequate space; use the existing TextArea with vertical resizing. |
| [Nielsen Norman Group: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Put frequent tasks first and keep secondary controls discoverable. Apply to SQL, schema, model configuration and traces without hiding errors or removing access. |
| [Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/) and [AI label](https://carbondesignsystem.com/components/ai-label/usage/) | Identify AI-prepared content in context and expose its actual details. Do not label a person's input as AI-generated. |
| [Nielsen Norman Group: Explainable AI in Chat Interfaces](https://www.nngroup.com/articles/explainable-ai/) (12 December 2025) | Plausible explanations can encourage misplaced trust. Use recorded outcomes and limitations, without invented confidence or reassuring model rationales. |
| [Carbon: Notifications](https://carbondesignsystem.com/components/notification/usage/) | Explain what happened and the next useful action. Keep actionable errors visible; use brief confirmations for successful saves. |
| [GOV.UK: Error messages](https://design-system.service.gov.uk/components/error-message/) | State the problem and recovery action in understandable language; retain the original diagnostic separately. |
| [W3C: Dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | Custom dragging needs an equivalent non-drag pointer action, not keyboard support alone. Native browser controls have an exception. Expand/Restore makes resizing more accessible regardless. |
| [W3C: Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Respect the 24 CSS-pixel minimum or applicable spacing exceptions; the mock's action buttons use larger targets. |
| [W3C: Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Fixed content must not conceal focused controls. Reserve real layout space for the composer and check focused result actions. |

## Applying the guidance to a simpler default

The default exposes the user's task, with technical and construction tools
available on demand. This is progressive disclosure, not capability removal.
The [capability inventory](spec.md#complexity-is-disclosed-not-removed) is the
implementation safeguard. An optional advanced view keeps tools open across
steps; it shares the same data and draft state.

| Additional source checked 9 September 2026 | Application |
| --- | --- |
| [NHS design principles](https://service-manual.nhs.uk/design-system/design-principles) | Respect people's emotional and technical needs; avoid transferring system complexity to them; test with real people. Use a task-centered screen rather than an inventory of internal objects. |
| [GOV.UK: Writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces) | Prefer short, approachable copy and repair interfaces that need lengthy explanation. Move model/version terminology to its relevant controls; use familiar actions and contextual help. |
| [NN/g: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Keep secondary capabilities clearly discoverable and avoid deep layers. Individual SQL/settings controls remain directly reachable, while advanced view can keep them open. |
| [NN/g: Empty states in complex applications](https://www.nngroup.com/articles/empty-state-interface-design/?lm=button-states-communicate-interaction&pt=article) | Explain what someone can do and give a direct starting action. The landing screen leads to a question; empty libraries offer the next available step. |

These sources support the hierarchy and disclosure strategy. They do not prove
that a warm neutral palette, green accent or rounded composer is inherently
better for Catalyst. Those are design hypotheses for the staff/analyst review.
Keep errors, source identity and limitations visible; reduce interface chrome
without manufacturing reassuring explanations of SQL.

## Mock checks actually performed

The final shell was served with Python's standard HTTP server, without builds,
dependencies, model calls, database access or credentials.

| Check | Observed result |
| --- | --- |
| Resize and prepare shortcut | Native drag visibly increased the eight-line writing area. Expand/Restore worked; Ctrl+Enter prepared a candidate containing all eight lines, with Get results still a separate action. |
| Advanced view retains work | Edited SQL and a follow-up question remained intact after Hide/Show advanced tools. SQL stayed visible after Get results; exact SQL and technical information were open in result review. |
| Actual 320, 390, 640 and 1280 CSS-pixel frame widths | Root width equaled scroll width at each size. At 622 px height, expanded input left Continue within the frame (bottom approximately 555, 555, 573 and 588 px). View results remained reachable at every width. |
| Review keyboard handling | Shift+Tab from first control wrapped to last; Tab from last wrapped to first. Escape returned focus to the actual View results trigger. |
| Retained capability checks | Single SQL editor, explicit Get results, full-table review, exact diagnostic and unknown AI review status remain reachable in the final layout. |
| Save-to-dashboard flow retested on final shell | Saved a named query through View results, opened Saved work, created a named Table, and reached Waiting for import through Add to dashboard and Publish. These are mock transitions, not external writes. |
| Other fixture states, checked before shell revision | Limited/error/clarification/unsupported/imported/failed fixtures were inspected. Their backend behavior is not implemented in this mock. |
| Earlier source/profile checks, before shell revision | OpenMRS session selection changed the source and explicit model choice changed the selected profile. Final design presents the exact profile in Query settings and advanced view instead of a default badge. |
| JavaScript syntax and artifact integrity | JavaScript syntax, local links, unique HTML IDs, whitespace and image signatures checked. No production test suite was run. |

The initial mock had two issues repaired during QA: its growing composer covered
a result action, and native dialog focus could leave the preview iframe. The
final layout allocates content/composer space in CSS grid, caps narrow-screen
input growth, and wraps focus at panel boundaries. Intermittent browser-tool
selector timeouts occurred; completed interactions and observed DOM states are
the evidence used here, not a claim of a clean automation console.

![Simple question screen](preview-desktop.jpg)

![Advanced tools kept open](preview-advanced.jpg)

Screenshots and preview use fictional data. They do not depict an actual
clinical result or a newly deployed application.

## Remaining implementation verification

No production code changed, so the application test suites were not run. This
mock is intentionally not an alternative implementation of Catalyst. It does
not demonstrate durable history, model/SQL correctness, complete catalog
pagination, query parameters, empty/stale result logic, asynchronous failure
recovery, multi-widget arrangement, bundle bytes or real importer receipts.

Production work must apply the [spec's acceptance checks](spec.md#acceptance-and-sequencing)
to the shared Carbon components and actual application states. Short viewports,
zoom, screen readers, dark/system theme, representative clinical/program staff
and analyst task sessions remain unverified. Final Dashboard acceptance still
requires the existing owner review with the real integrated stack.
