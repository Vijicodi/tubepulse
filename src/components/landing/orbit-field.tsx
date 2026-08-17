"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The second 3D object, for the lower half of the page.
 *
 * A point cloud shaped into concentric rings — a channel's catalogue seen from
 * above. Each point's distance from the centre is its outlier score, so the
 * ring structure is the product's own idea rendered literally: most videos sit
 * near the median, and the few that escape it are the ones worth copying.
 *
 * It rotates slowly on its own, leans toward the cursor, and spins faster as
 * you scroll past it, so the object is doing something different from the hero
 * mesh rather than repeating the effect.
 */

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2  uPointer;
  uniform float uSize;

  attribute float aSeed;
  attribute float aRing;

  varying float vRing;
  varying float vTwinkle;

  void main() {
    vRing = aRing;

    vec3 pos = position;

    // Points breathe outward and back, offset by seed so the ring never pulses
    // as one solid object.
    float breathe = sin(uTime * 0.8 + aSeed * 6.2831) * 0.05;
    pos.xz *= 1.0 + breathe;
    pos.y += sin(uTime * 0.6 + aSeed * 12.0) * 0.06;

    vTwinkle = 0.55 + 0.45 * sin(uTime * 2.0 + aSeed * 30.0);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);

    // Perspective-correct sizing: near points are larger. Without the divide
    // every point is the same size and the cloud reads as flat.
    gl_PointSize = uSize * (1.0 / -mv.z) * (0.6 + aRing * 0.9);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uBrand2;
  uniform vec3  uBrand3;
  uniform float uOpacity;

  varying float vRing;
  varying float vTwinkle;

  void main() {
    // Round the square point sprite into a soft disc.
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float soft = smoothstep(0.25, 0.02, d);

    // Outer rings are the outliers, so they carry the hot end of the brand.
    vec3 color = mix(uBrand2, uBrand3, vRing);

    gl_FragColor = vec4(color, soft * uOpacity * vTwinkle * (0.25 + vRing * 0.85));
  }
`;

function readBrand(el: HTMLElement, name: string, fallback: string) {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

export function OrbitField() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      48,
      host.clientWidth / host.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 2.6, 7.2);
    camera.lookAt(0, 0, 0);

    // Build the cloud: most points clustered near the centre (the median),
    // thinning outward, which is the actual shape of a channel's performance.
    const COUNT = 2600;
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const rings = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i += 1) {
      // Squaring the random pushes density toward the centre.
      const t = Math.random();
      const radius = 0.6 + t * t * 4.4;
      const angle = Math.random() * Math.PI * 2;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      seeds[i] = Math.random();
      rings[i] = Math.min(radius / 5, 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute("aRing", new THREE.BufferAttribute(rings, 1));

    const uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
      // Small and sharp. At 190 the sprites overlapped into red bokeh and
      // the ring structure — the entire point of the object — disappeared.
      uSize: { value: 62 },
      uOpacity: { value: 0 },
      uBrand2: { value: readBrand(host, "--brand-2", "#d42c8e") },
      uBrand3: { value: readBrand(host, "--brand-3", "#fa3b4d") },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.rotation.x = 0.32;
    scene.add(points);

    const pointer = new THREE.Vector2();
    const target = new THREE.Vector2();

    function onPointerMove(event: PointerEvent) {
      const rect = host!.getBoundingClientRect();
      target.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);

    let onScreen = false;
    const visibility = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    visibility.observe(host);

    const clock = new THREE.Clock();
    let frame = 0;
    let spin = 0;

    function tick() {
      frame = requestAnimationFrame(tick);
      if (!onScreen || document.hidden) return;

      pointer.lerp(target, 0.05);
      uniforms.uTime.value = reduced ? 0 : clock.getElapsedTime();
      uniforms.uOpacity.value += (1 - uniforms.uOpacity.value) * 0.03;

      // Scroll position through this element drives extra rotation, so the
      // object responds to the page as well as the cursor.
      const rect = host!.getBoundingClientRect();
      const progress = 1 - rect.top / window.innerHeight;
      spin += reduced ? 0 : 0.0012 + Math.max(progress, 0) * 0.004;

      points.rotation.y = spin;
      points.rotation.x = 0.32 + pointer.y * 0.16;
      points.position.x = pointer.x * 0.5;

      renderer.render(scene, camera);
    }
    tick();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
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
