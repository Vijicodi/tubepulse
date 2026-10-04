"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scrollTargetY } from "./scroll-target";

/**
 * Smooth scrolling, and the bridge between it and GSAP.
 *
 * Lenis replaces the browser's scroll with an interpolated one. On its own that
 * breaks ScrollTrigger, which reads native scroll position — the two end up a
 * frame apart and every pinned section judders. The fix is the three lines
 * below: Lenis drives GSAP's ticker, and tells ScrollTrigger to update on each
 * of its own frames instead.
 *
 * Mounted once by the landing page. The signed-in workspace keeps native
 * scrolling; hijacking scroll in a tool people use daily is an annoyance, not a
 * feature.
 *
 * ---------------------------------------------------------------------------
 * NATIVE SMOOTH SCROLLS ARE HANDED TO LENIS while this is mounted.
 *
 * Found on /pricing: returning from sign-in, the page calls
 * `card.scrollIntoView({ behavior: "smooth" })` to land on the plan that was
 * pressed — and never moved. ScrollTrigger's first refresh runs a frame later
 * (and again on window "load"); to measure, it jumps the window to 0 and back
 * with `scrollTo`, and any native `scrollTo` cancels a smooth scroll the
 * browser is still animating. Traced: scrollIntoView at 999ms, two
 * `scrollTo(0, 0)` from gsap at 1042ms, scrollY 0 forever after.
 *
 * Lenis animates from its own state and re-applies it every frame, so a
 * refresh in the middle costs it nothing. Patched only while mounted, only for
 * `behavior: "smooth"`, and only for elements the window itself scrolls to — a
 * node inside its own scroll box still gets the browser's version, because
 * Lenis can only move the window.
 * ---------------------------------------------------------------------------
 */
export function SmoothScroll() {
  useEffect(() => {
    // Someone who has asked the OS for less motion has also asked not to have
    // their scrolling reinterpreted.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // Touch devices already have momentum scrolling that people know. Adding
      // ours on top fights the platform.
      syncTouch: false,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const nativeScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(
      this: Element,
      arg?: boolean | ScrollIntoViewOptions,
    ) {
      if (typeof arg !== "object" || arg.behavior !== "smooth" || inOwnScrollBox(this)) {
        return nativeScrollIntoView.call(this, arg);
      }

      const rect = this.getBoundingClientRect();
      const style = getComputedStyle(this);

      lenis.scrollTo(
        scrollTargetY({
          rectTop: rect.top,
          rectHeight: rect.height,
          scrollY: window.scrollY,
          viewport: window.innerHeight,
          block: arg.block,
          marginTop: parseFloat(style.scrollMarginTop) || 0,
          marginBottom: parseFloat(style.scrollMarginBottom) || 0,
          maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        }),
      );
    };

    function raf(time: number) {
      // GSAP's ticker reports seconds; Lenis expects milliseconds.
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      Element.prototype.scrollIntoView = nativeScrollIntoView;
      gsap.ticker.remove(raf);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return null;
}

/** True when something between the element and the page scrolls on its own. */
function inOwnScrollBox(element: Element): boolean {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) return false;

    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      return true;
    }
  }
  return false;
}
