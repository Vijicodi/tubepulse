/**
 * Where a `scrollIntoView({ block })` would land, as a window scroll offset.
 *
 * Pure, so the arithmetic is testable without a browser. Used to hand a
 * native smooth scroll to Lenis instead (see smooth-scroll.tsx): Lenis wants a
 * number, the caller asked in terms of the element.
 *
 * `center` differs from the browser in one way, on purpose: see below.
 * `nearest` is treated as `start` — the only caller scrolls to something off
 * screen, where the two agree, and matching the browser's partial-visibility
 * rules exactly is not worth the code.
 */
export function scrollTargetY({
  rectTop,
  rectHeight,
  scrollY,
  viewport,
  block = "start",
  marginTop = 0,
  marginBottom = 0,
  maxScroll,
}: {
  /** getBoundingClientRect().top, i.e. relative to the viewport now. */
  rectTop: number;
  rectHeight: number;
  scrollY: number;
  /** window.innerHeight. */
  viewport: number;
  block?: ScrollLogicalPosition;
  /** The element's scroll-margin-top, e.g. Tailwind's scroll-mt-24. */
  marginTop?: number;
  marginBottom?: number;
  maxScroll: number;
}): number {
  const top = scrollY + rectTop;

  let y: number;
  // Centred, but never so high that the top slides under the fixed nav the
  // scroll-margin exists to clear — a card taller than the screen would
  // otherwise land with its heading hidden.
  if (block === "center") y = Math.min(top - (viewport - rectHeight) / 2, top - marginTop);
  else if (block === "end") y = top + rectHeight + marginBottom - viewport;
  else y = top - marginTop;

  return Math.round(Math.min(Math.max(y, 0), Math.max(maxScroll, 0)));
}
