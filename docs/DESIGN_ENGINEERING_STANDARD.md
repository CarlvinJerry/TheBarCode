# Dukora design engineering standard

This is the baseline for all new Dukora interfaces. It is informed by Emil Kowalski's publicly documented design-engineering guidance, adapted for a high-frequency touchscreen POS rather than copied from any product or personal visual identity.

## Principles

1. Motion must explain state, preserve spatial continuity, or acknowledge an action. Decorative motion is not added to daily POS workflows.
2. Feedback is immediate. Pressed controls scale subtly to `0.97`; asynchronous actions expose a busy or success/failure state.
3. UI motion is fast—normally 140–180 ms and always under 300 ms. Entrances use an energetic ease-out curve.
4. Popovers and dialogs appear from a visually credible origin and never animate from `scale(0)`.
5. Repeated keyboard, scanning, quantity, and navigation actions do not wait for animation.
6. Every workflow is understandable without motion. `prefers-reduced-motion` is fully respected.
7. Visual hierarchy comes from spacing, typography, contrast, and grouping—not excessive decoration.
8. Touch targets remain generous, focus indicators remain visible, and color is never the only status signal.
9. Success and failure messages state what happened and disappear only after the user has had time to read them.
10. Active operational conditions and unseen notifications are separate concepts. Opening the bell clears its unseen badge; unresolved work stays on the relevant menu until the source record is resolved.
11. Rounded cards are part of Dukora's identity, but cards are used only for a meaningful group, actionable summary, or elevated surface. Pages must not turn every sentence or field into an identical card.
12. Layout density follows the job: selling, stock control and bill follow-up are compact; configuration and destructive actions receive more space and explanation.
13. Use the Dukora stroke-icon family for navigation and actions. Emoji and unrelated Unicode symbols are not product icons.
14. Empty states explain why nothing is shown and provide the safest relevant next action.
15. Page hierarchy must identify one primary task. Supporting summaries, filters and history must not compete at equal visual weight.
16. Decorative edge accents are prohibited by default. Do not add colored top borders, side stripes, corner tabs, ribbons, or active-menu rails merely to make a surface feel designed. Use them only when explicitly requested or when the edge itself communicates a unique, necessary state.
17. Headings guide scanning rather than demand attention. Prefer medium or semibold weights, restrained sizes, and natural sentence case; reserve heavy display weight for the single most important value or message on a page.
18. Align titles, labels, controls, and row content to a shared text column. Optical alignment takes priority over centering content inside rounded corners.
19. Use one quiet separator system. Hairlines, borders, and dividers recede behind content; stronger borders indicate focus, selection, validation, or elevation—not decoration.
20. Group captions use sentence case. Uppercase and wide letter spacing are reserved for genuinely short metadata such as receipt status or compact table headings.
21. Cards must read as surfaces, not outlined boxes: give them a clear background, quiet boundary, and at most a subtle resting shadow. Avoid nesting cards when spacing or a divider establishes the same relationship.
22. Establish page rhythm deliberately: keep related heading-to-content gaps tight, add more space between separate groups, and keep row titles compact with line-height rather than oversized padding.

## Shared tokens

- Surfaces: quiet neutral canvas with white operational surfaces.
- Radius: 8–10 px controls, 12 px compact surfaces, 14–16 px cards/dialogs. Rounded geometry is retained deliberately, with quieter borders and fewer unnecessary containers.
- Motion: 140 ms direct feedback, 180 ms entrances, `cubic-bezier(.16,1,.3,1)`.
- Shadows: subtle at rest; stronger only for elevated dialogs, popovers, and interactive hover states.
- Typography: system UI stack, sentence-case compact labels, medium/semibold headings, tabular financial values where practical.
- Separators: one-pixel quiet hairlines. No decorative colored edge strips.
- Rhythm: approximately 12 px from a section heading to its content, and 28–32 px between independent groups when the workflow has room.

## Review checklist

- Does every animation have a clear purpose?
- Does the action acknowledge input immediately?
- Can a cashier repeat it hundreds of times without delay or irritation?
- Is the state equally clear with reduced motion and without color?
- Does the component preserve the current theme, display scale, mobile layout, and touch target size?
- Are success, failure, empty, loading, disabled, and offline states all represented?
- Does each card correspond to a real information group or action rather than merely decorating content?
- Are icons sourced from the shared stroke-icon vocabulary?
- Does the page have a clear primary task and product-specific information density?
- Are any edge strips, colored rails, corner decorations, or ribbons present without carrying necessary state?
- Could a heavy heading be reduced to medium or semibold without weakening hierarchy?
- Do labels and row titles align to a shared text column and use sentence case?
- Are related elements closer to each other than they are to the next group?
