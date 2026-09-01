import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * WHY 100 IS LISTED HERE.
     *
     * `components/brand/logo.tsx` renders the wordmark at `quality={100}`
     * because Next's default of 75 puts visible banding through a smooth
     * violet-to-red gradient — that reasoning is written up in the component
     * and in AGENTS.md.
     *
     * Next 16 will only honour a quality that appears in this list. With the
     * list unset it defaults to [75], so the logo's `quality={100}` was being
     * REJECTED and silently served at 75 — the banding the prop exists to
     * prevent, with only a dev-server warning to say so.
     *
     * 75 stays for every other image; there is no reason to re-encode
     * photographs at 100.
     */
    qualities: [75, 100],
  },
};

export default nextConfig;
