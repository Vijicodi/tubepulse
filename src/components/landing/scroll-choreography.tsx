"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Every scroll-driven animation on the landing page, in one place.
 *
 * Declarative on purpose: sections opt in with data attributes rather than each
 * one importing GSAP and registering its own trigger. That keeps the section
 * markup readable, keeps GSAP out of six different bundles, and means the
 * timing language of the page is defined once instead of drifting per section.
 *
 *   data-reveal="up" | "left" | "right" | "scale" | "clip"
 *   data-reveal-delay="0.12"          extra delay in seconds
 *   data-stagger                      children animate in sequence
 *   data-parallax="-80"               pixels of drift across the viewport
 *   data-marquee="-30"                percent of horizontal travel on scroll
 *   data-count="1200"                 number to count up to
 *
 * The start state lives in CSS (`[data-reveal] { opacity: 0 }`), so nothing
 * flashes at full opacity before hydration.
 */

const ENTRANCES = {
  up: { y: 56, opacity: 0 },
  left: { x: -70, opacity: 0 },
  right: { x: 70, opacity: 0 },
  scale: { scale: 0.9, opacity: 0 },
  clip: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
} as const;

type Entrance = keyof typeof ENTRANCES;

export function ScrollChoreography() {
  useEffect(() => {
    const root = document.querySelector(".tp-landing");
    if (!root) return;

    // Without JS the CSS keeps everything visible; with it, we take over.
    root.classList.remove("tp-no-js");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        el.style.opacity = "1";
      });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // --- entrances -------------------------------------------------------
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        const kind = (el.dataset.reveal || "up") as Entrance;
        const from = ENTRANCES[kind] ?? ENTRANCES.up;
        const delay = parseFloat(el.dataset.revealDelay || "0");

        // A container marked data-stagger animates its children in sequence
        // rather than itself. Label, then heading, then body, then button —
        // the order they should be read in.
        const targets = el.hasAttribute("data-stagger")
          ? Array.from(el.children)
          : [el];

        if (el.hasAttribute("data-stagger")) el.style.opacity = "1";

        // fromTo, never from.
        //
        // The CSS start state is `opacity: 0`. gsap.from() reads the element's
        // CURRENT value as the destination, so it animated 0 -> 0 and left the
        // element permanently invisible. Staggered containers escaped it only
        // because the line above sets the container to 1 before the tween is
        // built, and their animated children carry no CSS opacity rule.
        //
        // Two whole sections shipped blank because of this. Always state the
        // end explicitly.
        gsap.fromTo(
          targets,
          { ...from },
          {
            opacity: 1,
            x: 0,
            y: 0,
            scale: 1,
            clipPath: "inset(0 0 0% 0)",
            duration: 1,
            delay,
            ease: "power3.out",
            stagger: el.hasAttribute("data-stagger") ? 0.1 : 0,
            // If the trigger somehow never fires, the element must not be left
            // invisible — this is the failure mode that produced a blank card.
            immediateRender: false,
            scrollTrigger: {
              trigger: el,
              start: "top 82%",
              once: true,
            },
          },
        );

        // Anything already above the fold on load has no scroll left to trigger
        // it. Reveal those immediately rather than waiting for a scroll that
        // may never come.
        if (el.getBoundingClientRect().top < window.innerHeight * 0.82) {
          gsap.set(el, { opacity: 1 });
        }
      });

      // --- parallax --------------------------------------------------------
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        gsap.to(el, {
          y: parseFloat(el.dataset.parallax || "-60"),
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
      });

      // --- horizontal marquee ----------------------------------------------
      gsap.utils.toArray<HTMLElement>("[data-marquee]").forEach((el) => {
        gsap.to(el, {
          xPercent: parseFloat(el.dataset.marquee || "-30"),
          ease: "none",
          scrollTrigger: {
            trigger: el.parentElement ?? el,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
          },
        });
      });

      // --- counters --------------------------------------------------------
      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
        const target = parseFloat(el.dataset.count || "0");
        const decimals = parseInt(el.dataset.countDecimals || "0", 10);
        const counter = { value: 0 };

        gsap.to(counter, {
          value: target,
          duration: 1.8,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
          onUpdate: () => {
            el.textContent = counter.value.toLocaleString("en-US", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            });
          },
        });
      });

      // --- the pinned section ----------------------------------------------
      const pinned = document.querySelector<HTMLElement>("[data-pin]");
      if (pinned) {
        const steps = gsap.utils.toArray<HTMLElement>("[data-pin-step]");

        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: pinned,
            start: "top top",
            end: () => `+=${steps.length * 70}%`,
            pin: true,
            scrub: 0.8,
            // Pinning changes document height; without this the sections after
            // it are measured against the old height and trigger early.
            invalidateOnRefresh: true,
          },
        });

        steps.forEach((step, index) => {
          timeline.fromTo(
            step,
            { opacity: 0, y: 40 },
            { opacity: 1, y: 0, duration: 0.5 },
            index * 0.6,
          );
          if (index < steps.length - 1) {
            timeline.to(step, { opacity: 0, y: -40, duration: 0.4 }, index * 0.6 + 0.5);
          }
        });
      }
    }, root);

    // Fonts land after first paint and change every text height. Without this
    // the triggers are all measured against the fallback font's metrics.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => ctx.revert();
  }, []);

  return null;
}
