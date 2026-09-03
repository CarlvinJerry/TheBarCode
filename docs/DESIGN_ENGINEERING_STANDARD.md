# BRD design engineering standard

This is the canonical baseline for UI design and frontend engineering across BRD products. It is informed by established interaction-design practice and lessons learned while building data-intensive operational, analytics, configuration, administration, and reporting workflows.

Product-specific guidance may extend this standard, but it must not silently weaken accessibility, data integrity, security, performance, or interaction requirements. When a product needs an exception, document the reason beside the implementation and preserve the safest equivalent behavior.

## How this standard is used

- Read this file before planning, implementing, or reviewing UI work.
- Include relevant compliance checks in the implementation plan and definition of done.
- Reuse shared tokens, components, and patterns before adding local variants.
- Treat all observable states as part of the feature: initial, loading, empty, partial, success, failure, disabled, permission-restricted, offline, and retrying.
- Test the changed workflow at its supported breakpoints, in light and dark themes, in comfortable and compact density, by keyboard, and with reduced motion.
- A working API call is not a finished UI. Navigation, feedback, recovery, accessibility, performance, and state persistence must also work.

## Interaction and motion

1. Motion must explain state, preserve spatial continuity, or acknowledge an action. Decorative motion is not added to frequent operational workflows.
2. Feedback is immediate. Pressed controls may scale subtly to `0.97`; asynchronous actions expose a busy state and a clear success or failure result.
3. UI motion is fast—normally 140–180 ms and always under 300 ms. Entrances use an energetic ease-out curve such as `cubic-bezier(.16,1,.3,1)`.
4. Popovers and dialogs appear from a visually credible origin and never animate from `scale(0)`.
5. Repeated keyboard, scanning, quantity, selection, and navigation actions do not wait for animation.
6. Every workflow remains understandable without motion. Both the operating-system `prefers-reduced-motion` setting and an in-product reduced-motion preference are respected.
7. Long-running work reports real server or job progress whenever available. Indeterminate progress is labelled as such; fabricated percentages must not imply measured completion.
8. Prevent accidental duplicate submissions while work is running. Offer cancellation only when it is safe and supported, and retain a recoverable job reference for background operations.

## Hierarchy, layout, and visual language

9. Visual hierarchy comes from spacing, typography, contrast, and grouping—not excessive decoration.
10. Every page identifies one primary task. Supporting summaries, filters, history, and secondary actions must not compete at equal visual weight.
11. Rounded cards are used only for a meaningful group, actionable summary, destination, or elevated surface. Do not turn every sentence or field into an identical card.
12. Cards read as surfaces, not outlined boxes: give them a clear semantic background, quiet boundary, and at most a subtle resting shadow. Avoid nesting cards when spacing or a divider establishes the relationship.
13. Destination cards are visually and semantically distinct from output or metric cards. Subtle themed tints are acceptable for destinations; data outputs remain quieter so results retain priority.
14. Decorative edge accents are prohibited by default. Colored rails, ribbons, tabs, and borders are reserved for focus, selection, validation, severity, or another necessary state.
15. Headings guide scanning rather than demand attention. Prefer medium or semibold weights, restrained sizes, and natural sentence case; reserve heavy display weight for the single most important value or message.
16. Align titles, labels, controls, numbers, and row content to shared text columns. Optical alignment takes priority over centering within rounded shapes.
17. Use one quiet separator system. Strong borders indicate focus, selection, validation, or elevation—not decoration.
18. Establish page rhythm deliberately: keep related heading-to-content gaps tight, use about 12 px within a section, and 28–32 px between independent groups when space allows.
19. Density follows the job. Data review and repeated operations can be compact; learning, configuration, approval, and destructive actions receive more room and explanation.
20. Comfortable and compact density are semantic user preferences, not ad hoc page overrides. Compact mode must reduce outer gutters, card padding, form gaps, and grid row height consistently without shrinking required touch targets.
21. Avoid fixed blank canvas around a narrow workspace on large screens. Use a bounded readable width for prose and forms, and offer a persisted full-width mode for analytics, grids, and reports.
22. Use shared semantic color and spacing tokens. Fixed light surfaces such as `white` or `#fff` are prohibited for application chrome unless the surface must stay white for a functional reason such as a printable page or QR-code quiet zone.

## Controls, navigation, and accessibility

23. Use the product's shared stroke-icon family for navigation and actions. Emoji and unrelated Unicode symbols are not product icons.
24. Touch targets remain at least 44 px where touch use is expected, focus indicators stay visible, and color is never the only signal. Directional values pair color with a sign, icon, or text label.
25. Interactive elements use their native semantics: links navigate, buttons act, inputs collect values. A clickable `div`, `span`, or `li` must be replaced with a semantic control unless it fully implements role, name, focus, keyboard activation, and disabled behavior.
26. Whole destination cards are one semantic link or button with a descriptive accessible name. Hover styling or a displayed URL is not proof that navigation works; the target route and query state must be exercised.
27. Buttons never rely on browser-default rendering. Every action uses a shared primary, secondary, quiet, or danger treatment, a clear label, a consistent height, an explicit `type`, and a visible disabled state.
28. Tabs use correct tab semantics, expose the active state, support keyboard navigation, and display only the active panel. Switching tabs must not silently discard unsaved local form state.
29. Dialogs trap focus, have an accessible name, close with Escape where safe, return focus to their trigger, and use the shared modal/confirmation treatment. Native browser `alert` and `confirm` dialogs are not production interaction patterns.
30. Every meaningful image has useful alternative text; decorative images use an empty alternative. Icon-only buttons always have an accessible name.

## Responsive behavior

31. Mobile layouts are designed as primary operating surfaces, not scaled desktop pages. At narrow widths use one clear content column, 16 px form text to prevent browser zoom, appropriate bottom-sheet dialogs, and full-width primary actions where useful.
32. Mobile information density remains readable: secondary copy may wrap, values stay visually paired with labels, and horizontal scrolling is limited to grids whose columns cannot be responsibly collapsed.
33. Responsive behavior is verified at phone, tablet, laptop, and wide-desktop widths. No supported view may hide an action, clip a dialog, overlap text, or require page-level horizontal scrolling.

## Data, analytics, and grids

34. Operational grids provide global search, filtering, explicit sorting, user-controlled column ordering, bounded or virtual scrolling, paging when useful, and export when permitted. Domain-specific default column order is preserved and action columns are not sortable.
35. Grid export obeys current authorization and data scope. Its label states whether it exports the current filtered view, selected rows, or the complete permitted dataset.
36. Empty states distinguish no source data, no filter matches, missing prerequisites, permission restrictions, and failed loading. Each state explains why nothing is shown and offers the safest relevant next action.
37. Analytical outputs come from traceable source data and statistically valid calculations. Do not hardcode plausible results, substitute synthetic evidence silently, or present an approximation as an approved result.
38. Show provenance and readiness where it affects interpretation: assessment context, input coverage, configuration or method applied, run time/version, approval state, and any limitations.
39. Calculated and approved values follow an explicit precedence policy. If evidence is insufficient, stop the affected output and guide the user to supply or approve a valid fallback; do not silently choose one.
40. Positive and negative differences use semantic direction consistently across grids, charts, and reports. Use accessible colors plus a sign or label, and define what a positive value means in context.

## Workflows, state, and error recovery

41. Multi-stage workflows are ordered by dependency. Offer both a dependency-aware “run all” action and individual stage actions where users need them; explain which completed prerequisites will be reused.
42. Readiness guidance is contextual. Before a dependent action runs, identify missing prerequisites and link directly to the relevant import, configuration, approval, or prior analysis. After prerequisites exist, state which version or values will be applied.
43. Success and failure messages say what happened, to which object, and what the user can do next. Keep them visible long enough to read and preserve technical correlation details without exposing sensitive internals.
44. Batch work preserves successful items when individual items fail, reports failures by item with actionable reasons, and allows retrying only the failed subset when safe.
45. Unsaved changes survive tab switching and accidental navigation. Warn before destructive route changes, and make Save, Discard, retry, and conflict behavior explicit.
46. Local optimistic updates reconcile with server truth. On failure, restore the last confirmed state and explain what was not saved.
47. Background refresh is deliberate: pause it when the page is inactive, prevent overlapping requests, use bounded backoff after failures, and unsubscribe on teardown. Repeated polling must not be used merely to keep an inactive feature “warm.”
48. Cache keys and visible data are scoped by user, tenant, role, assessment type, assessment, and configuration version as required. Mutations invalidate affected entries, and tenant or identity changes clear incompatible client state.

## Security and scope

49. The UI reflects—not replaces—server authorization. Restricted actions are omitted or disabled consistently, but every API remains independently authorized.
50. Tenant, role, assessment type, and assessment context are preserved through navigation, filters, exports, analytics, reports, caches, and AI context. Switching scope must not leak selections or data from the previous scope.
51. High-impact actions name their scope and consequence before confirmation. Destructive and cross-tenant actions require stronger visual treatment and auditability.
52. Log meaningful user actions such as import, configuration change, approval, analysis run, export, report generation, cache invalidation, invitation, and administrative scope change. Do not flood the audit trail with passive rendering or background refresh.

## Contextual AI

53. AI assistance is page-aware and user-invoked. It updates its local context when the active page, tab, filters, assessment, or displayed data changes; it does not continuously call the model in the background.
54. Show three to five concise quick questions that are specific to the active task and available data. Suggested questions are prompts, not pre-executed model requests.
55. Bound context by selecting summaries and representative rows, never entire large datasets. Cap conversation history and payload size, expose data coverage to the model, and fetch deeper context only when the user's question requires it.
56. AI responses must respect current authorization and scope, distinguish observed data from recommendations, and never manufacture missing analytical evidence. Sensitive fields are excluded unless essential and permitted.
57. Health checks, context preparation, and suggestion refreshes are cached or event-driven and must not create noisy request loops. If AI is unavailable, the underlying workflow remains fully usable.

## Reports and document viewers

58. Report controls share the same assessment, readiness, configuration, and error vocabulary as analytics. A report failure caused by readiness links to the exact missing input or approval.
59. Viewers expose only supported formats and actions. Download names identify assessment, report type, subject where applicable, and generation context without leaking sensitive data.
60. Printed or exported content keeps topics, charts, captions, and non-table blocks together when they fit. Tables may split with repeated headers; sections use reasonable spacing and configurable page-break behavior rather than unconditional new pages.

## Shared tokens

- Surfaces: semantic canvas, operational surface, elevated surface, inset surface, and print surface tokens for both light and dark themes.
- Radius: 8–10 px controls, 12 px compact surfaces, and 14–16 px cards/dialogs.
- Motion: 140 ms direct feedback, 180 ms entrances, `cubic-bezier(.16,1,.3,1)`.
- Shadows: subtle at rest; stronger only for elevated dialogs, popovers, and interactive hover states.
- Typography: system UI stack, sentence-case compact labels, medium/semibold headings, and tabular numerals for aligned quantitative data.
- Separators: one-pixel quiet hairlines; no decorative colored edge strips.
- Rhythm: about 12 px from a section heading to its content and 28–32 px between independent groups in comfortable mode, reduced consistently in compact mode.
- Status: semantic success, warning, danger, information, neutral, and directional-positive/directional-negative tokens with non-color cues.

## Definition of done

A UI change is complete only when all applicable checks pass:

- The primary task, hierarchy, and responsive layout are clear at supported widths.
- Links, whole-card destinations, buttons, tabs, dialogs, and keyboard paths work—not only hover states.
- Loading, empty, partial, success, failure, disabled, offline, retry, and permission states are intentional.
- Light, dark, high-contrast, comfortable, compact, full-width, sticky-grid-header, and reduced-motion preferences remain coherent where supported.
- Data grids expose the required interaction and export behavior without changing authoritative source data.
- Dependency order, readiness, provenance, approval, and fallback behavior are explicit for analytical work.
- Tenant, role, assessment type, filter, cache, export, report, and AI scopes remain isolated.
- Long-running actions show truthful progress, prevent duplicates, support safe recovery, and avoid overlapping polling.
- User-facing errors are actionable; batch failures preserve valid successes.
- The feature uses shared components and semantic tokens instead of inline styles or one-off fixed colors.
- Automated tests cover logic and state transitions; focused keyboard, responsive, theme, and visual checks cover the rendered workflow.
- Relevant audit events are recorded without logging sensitive data or passive UI noise.

## Review questions

- Does every animation and decoration have a clear purpose?
- Can a frequent user repeat the workflow without delay or irritation?
- Is the state equally clear without motion and without color?
- Can a keyboard and screen-reader user identify and operate every control?
- Does each card correspond to a real group, destination, or actionable summary?
- Are related elements closer to each other than to the next group?
- Can every grid be searched, filtered, sorted, reordered, scrolled, and exported as its use case requires?
- Does an empty or failed output explain the exact cause and recovery path?
- Are prerequisites and applied configurations visible before consequential analysis or reporting?
- Does switching user, tenant, exam type, assessment, tab, or route preserve only compatible state?
- Is progress truthful, polling bounded, and cached data invalidated at the right scope?
- Does contextual AI receive only the smallest relevant authorized context after the user asks a question?
- Has the implementation been verified in every supported theme, density, motion, and viewport mode?
