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

## Shared tokens

- Surfaces: quiet neutral canvas with white operational surfaces.
- Radius: 8 px controls, 12 px compact surfaces, 16 px cards/dialogs.
- Motion: 140 ms direct feedback, 180 ms entrances, `cubic-bezier(.16,1,.3,1)`.
- Shadows: subtle at rest; stronger only for elevated dialogs, popovers, and interactive hover states.
- Typography: system UI stack, compact labels, tabular financial values where practical.

## Review checklist

- Does every animation have a clear purpose?
- Does the action acknowledge input immediately?
- Can a cashier repeat it hundreds of times without delay or irritation?
- Is the state equally clear with reduced motion and without color?
- Does the component preserve the current theme, display scale, mobile layout, and touch target size?
- Are success, failure, empty, loading, disabled, and offline states all represented?
