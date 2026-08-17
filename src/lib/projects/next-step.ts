/**
 * What to do next in this project.
 *
 * A folder that only lists what is in it makes you work out the next move
 * yourself. This decides it, from what the project actually contains.
 *
 * ORDER MATTERS AND IS THE WHOLE DESIGN. Each rule fires only when everything
 * above it is satisfied, so the answer is always the earliest unfinished thing
 * rather than a list of everything outstanding. Being told six things is the
 * same as being told nothing.
 *
 * Pure — no database, no clock, no environment — so every branch below is
 * testable, which matters because this is the sentence most people will read
 * first when they open the app.
 */

export interface ProjectState {
  channels: number;
  /** Videos or posts collected across every channel. */
  items: number;
  ideas: number;
  savedIdeas: number;
  /** A scrape or generation currently queued or running. */
  jobRunning: boolean;
  /** The most recent job failed, and nothing has succeeded since. */
  lastJobFailed: boolean;
  /** Scrapes left, allowance plus refills. */
  scrapesLeft: number;
}

export interface NextStep {
  /** Short imperative, used as the heading. */
  title: string;
  /** One sentence saying why this is next. */
  body: string;
  /** Where the button goes. Null when there is nothing to press. */
  href: string | null;
  /** The button's words. Null alongside a null href. */
  cta: string | null;
  /** Nothing is outstanding — the project is in good shape. */
  done?: boolean;
}

export function nextStep(state: ProjectState): NextStep {
  // Something is already happening. Anything else would be advice to ignore.
  if (state.jobRunning) {
    return {
      title: "Work is running",
      body: "A scrape or generation is in progress. It carries on if you close this tab.",
      href: "/competitors",
      cta: "Watch it",
    };
  }

  // A failure is louder than a suggestion: acting on the old advice would just
  // hit the same wall.
  if (state.lastJobFailed) {
    return {
      title: "The last run failed",
      body: "Nothing was charged for it. The reason is on the competitor it belonged to.",
      href: "/competitors",
      cta: "See why",
    };
  }

  if (state.channels === 0) {
    // Out of scrapes with nothing collected is a dead end, so say the thing
    // that actually unblocks them rather than sending them to a refusal.
    if (state.scrapesLeft <= 0) {
      return {
        title: "You are out of scrapes",
        body: "This project has no competitors yet, and adding one needs a scrape.",
        href: "/billing",
        cta: "Get more",
      };
    }

    return {
      title: "Add your first competitor",
      body: "Paste a YouTube channel or an Instagram profile. Everything else here is built from that.",
      href: "/competitors",
      cta: "Add one",
    };
  }

  if (state.items === 0) {
    return {
      title: "Nothing collected yet",
      body: "The competitors are here but their videos are not. The scrape may have been interrupted.",
      href: "/competitors",
      cta: "Check them",
    };
  }

  if (state.ideas === 0) {
    if (state.scrapesLeft <= 0) {
      return {
        title: "You are out of scrapes",
        body: "The evidence is collected, but generating ideas from it spends one.",
        href: "/billing",
        cta: "Get more",
      };
    }

    return {
      title: "Turn the evidence into ideas",
      body: "You have the breakouts. The Idea lab reads them and proposes concepts, each citing the videos behind it.",
      href: "/idea-lab",
      cta: "Generate",
    };
  }

  if (state.savedIdeas === 0) {
    return {
      title: "Shortlist what is worth making",
      body: `${state.ideas} ${state.ideas === 1 ? "idea is" : "ideas are"} waiting. Saving one keeps it with its evidence attached.`,
      href: "/idea-lab",
      cta: "Review them",
    };
  }

  // Everything is done. Say so plainly instead of inventing a task — a hub that
  // always demands something is a hub nobody believes.
  return {
    title: "This project is in good shape",
    body: `${state.channels} ${state.channels === 1 ? "competitor" : "competitors"} tracked, ${state.ideas} ideas generated and ${state.savedIdeas} shortlisted. Add another competitor when you want more.`,
    href: "/competitors",
    cta: "Add a competitor",
    done: true,
  };
}
