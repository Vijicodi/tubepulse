"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The 3D object behind the hero.
 *
 * A displaced plane, shaded with the brand gradient, behaving like a pulse
 * travelling across a surface — which is the product's name and the one idea
 * the landing page has to land. It reacts to two inputs:
 *
 *   - the pointer, which pushes a bright wake into the surface and tilts the
 *     mesh a few degrees
 *   - scroll, which flattens and dims it as the hero leaves
 *
 * Deliberately NOT the logo extruded into 3D. The logo is supplied artwork and
 * is not ours to reinterpret; a hand-traced 3D version is exactly the kind of
 * "close enough" redraw that is worse than not doing it at all.
 *
 * Raw three.js rather than react-three-fiber: this is one mesh with one
 * material, and r3f would add a reconciler and a large dependency to draw it.
 */

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2  uPointer;
  uniform float uPointerStrength;
  uniform float uFlatten;

  varying float vElevation;
  varying vec2  vUv;

  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

  // Compact 2D simplex noise. Cheaper per vertex than a texture lookup, and at
  // this mesh density it runs on integrated graphics without complaint.
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865, 0.366025403, -0.577350269, 0.024390243);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Two wave trains at different speeds and scales, so the surface never
    // visibly repeats.
    float wave = snoise(vec2(pos.x * 0.34 + uTime * 0.16, pos.y * 0.34 - uTime * 0.11)) * 0.85;
    wave += snoise(vec2(pos.x * 0.90 - uTime * 0.24, pos.y * 0.90 + uTime * 0.19)) * 0.26;

    // The pointer lifts the surface with a gaussian falloff — the wake.
    float d = distance(pos.xy, uPointer * 4.2);
    float touch = exp(-d * d * 0.16) * uPointerStrength * 1.5;

    float elevation = (wave + touch) * uFlatten;
    pos.z += elevation;

    vElevation = elevation;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uBrand1;
  uniform vec3  uBrand2;
  uniform vec3  uBrand3;
  uniform float uOpacity;

  varying float vElevation;
  varying vec2  vUv;

  void main() {
    // Height drives the gradient: crests reach the red end, troughs sink into
    // violet. The three stops are the logo's, passed in from CSS.
    float t = clamp(vElevation * 0.55 + 0.5, 0.0, 1.0);
    vec3 color = t < 0.5
      ? mix(uBrand1, uBrand2, t * 2.0)
      : mix(uBrand2, uBrand3, (t - 0.5) * 2.0);

    // A grid rather than a solid surface: this should read as an instrument
    // readout, not a lava lamp.
    vec2 grid = abs(fract(vUv * 46.0) - 0.5) / fwidth(vUv * 46.0);
    float line = 1.0 - min(min(grid.x, grid.y), 1.0);

    // Fade every edge so the plane never shows a hard rectangle. The band is
    // deliberately wide: fading from 0.32 left only the centre visible, which is
    // exactly the part sitting behind the headline, so the mesh read as a few
    // stray lines in the corners.
    float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x)
               * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);

    float alpha = line * edge * uOpacity * (0.55 + t * 0.9);
    if (alpha < 0.002) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

/** Reads a brand hex off the element, so colour keeps coming from the theme. */
function readBrand(el: HTMLElement, name: string, fallback: string): THREE.Color {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

export function PulseField() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // WebGL is not guaranteed. If the context fails, the hero still has its
    // gradient bloom behind it and simply loses the mesh.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Cap the pixel ratio: a 3x display renders nine times the pixels, which is
    // where the fan starts up for no visible gain.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      host.clientWidth / host.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, -3.4, 5.2);
    camera.lookAt(0, 0, 0);

    const uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPointerStrength: { value: 0 },
      uFlatten: { value: 1 },
      uOpacity: { value: 0 },
      uBrand1: { value: readBrand(host, "--brand-1", "#5b26e6") },
      uBrand2: { value: readBrand(host, "--brand-2", "#d42c8e") },
      uBrand3: { value: readBrand(host, "--brand-3", "#fa3b4d") },
    };

    const geometry = new THREE.PlaneGeometry(13, 13, 190, 190);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI * 0.36;
    scene.add(mesh);

    const pointer = new THREE.Vector2(0, 0);
    const target = new THREE.Vector2(0, 0);
    let strengthTarget = 0;

    function onPointerMove(event: PointerEvent) {
      const rect = host!.getBoundingClientRect();
      target.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
      strengthTarget = 1;
    }
    function onPointerLeave() {
      strengthTarget = 0;
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });

    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);

    // Stop rendering when the hero is off screen or the tab is hidden. A WebGL
    // loop running behind another tab is pure battery drain.
    let onScreen = true;
    const visibility = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    visibility.observe(host);

    const clock = new THREE.Clock();
    let frame = 0;

    function tick() {
      frame = requestAnimationFrame(tick);
      if (!onScreen || document.hidden) return;

      // Ease toward the pointer rather than snapping. The lag is what makes the
      // surface feel like a physical thing being pushed.
      pointer.lerp(target, 0.055);
      uniforms.uPointer.value.copy(pointer);
      uniforms.uPointerStrength.value +=
        (strengthTarget - uniforms.uPointerStrength.value) * 0.05;

      uniforms.uTime.value = reduced ? 0 : clock.getElapsedTime();
      uniforms.uOpacity.value += (1 - uniforms.uOpacity.value) * 0.02;

      const progress = Math.min(window.scrollY / window.innerHeight, 1);
      uniforms.uFlatten.value = 1 - progress * 0.85;

      mesh.rotation.z = pointer.x * 0.06;
      mesh.rotation.x = -Math.PI * 0.36 + pointer.y * 0.045;

      renderer.render(scene, camera);
    }
    tick();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      resize.disconnect();
      visibility.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 [contain:strict]"
    />
  );
}
