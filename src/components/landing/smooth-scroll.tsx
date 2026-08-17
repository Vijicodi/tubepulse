"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

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

    function raf(time: number) {
      // GSAP's ticker reports seconds; Lenis expects milliseconds.
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return null;
}
