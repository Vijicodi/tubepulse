import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { canCreateProject, nextTierUp } from "@/lib/billing/quota";

/** Longest project name the form and the server action accept. */
export const PROJECT_NAME_MAX = 60;

export interface ProjectCap {
  /** True when this plan may not open another project. */
  reached: boolean;
  /** What to tell them, in one sentence. Empty while they are under the cap. */
  message: string;
  /** The plan that lifts the cap, for the "See Creator" link. Null at the top. */
  upgradeTo: string | null;
}

/**
 * Whether someone may open another project, and what to say if not.
 *
 * Pure, so the sidebar, the projects page, the new-project page and the server
 * action all word the cap identically — and so a Scout is told BEFORE typing a
 * name, not after pressing Create. The action still re-checks: this decides
 * what to show, never what is allowed.
 */
export function projectCap(planKey: PlanKey, count: number): ProjectCap {
  if (canCreateProject(planKey, count)) {
    return { reached: false, message: "", upgradeTo: null };
  }

  const plan = PLANS[planKey];
  const next = nextTierUp(planKey);
  const max = plan.features.maxProjects ?? 0;

  if (!next) {
    return {
      reached: true,
      message: `You have reached the project limit for ${plan.name}.`,
      upgradeTo: null,
    };
  }

  const nextMax = next.features.maxProjects;
  return {
    reached: true,
    message: `${plan.name} covers ${max} project${max === 1 ? "" : "s"}. ${next.name} gives you ${
      nextMax === null ? "unlimited" : nextMax
    }.`,
    upgradeTo: next.name,
  };
}
