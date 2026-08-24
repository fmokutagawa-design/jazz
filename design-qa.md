# Design QA — Jazz session hero

## Target and implementation

- Reference: `/Users/mokutagawa/.codex/generated_images/01a02bc8-4127-7093-9087-b369f37a0b32/exec-e57d6acc-380d-4149-83b1-287d279c8cc9.png`
- Implemented page: `index.html`
- Hero asset: `assets/jazz-session-hero.jpg`
- Verified states: desktop 1440×1024 and mobile 390×844
- Combined reference/implementation comparison: `/tmp/jazz-design-comparison.png`
- Desktop capture: `/tmp/jazz-session-implementation.png`
- Mobile capture: `/tmp/jazz-session-mobile.png`

## Visual comparison

- Typography: existing Jazz typography and hierarchy are preserved; the white headline remains readable over the darker left side.
- Spacing: the implemented hero is about 317 px high on desktop, intentionally slightly more compact than the roughly 350 px reference so the first event stays visible.
- Color: the established black, warm gold, white, and red palette is preserved.
- Image: four anonymous musicians are visibly playing together; faces are not identifiable. The 1487×1058 source was exported as a 180 KB web JPEG and uses a responsive cover crop.
- Copy: existing headline, subtitle, navigation, filters, and event content are unchanged.
- Mobile: title remains two lines, the ensemble remains recognizable, and there is no horizontal overflow.

## Functional checks

- About dialog opens and closes.
- Area filtering updates the visible event list.
- No browser console warnings or errors were observed.
- The existing event image enlargement and external links remain intact.

## Severity and iteration history

- P0: none.
- P1: none.
- P2: none.
- P3: desktop hero is slightly more compact than the reference; the photo crop is slightly tighter. Both are intentional responsive adaptations.
- Pass 1: reference and browser render were combined in one comparison image; no blocking mismatch was found.

final result: passed
