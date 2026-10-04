/**
 * The second line of the "Delete this idea?" confirm.
 *
 * Calendar slots cascade with the idea, so a scheduled idea has to say so
 * before the press — finding a hole in next week's plan afterwards is the
 * surprise this exists to prevent. The run line is there because a delete that
 * looks like it might refund something invites the question.
 */
export function ideaDeleteDetail(scheduled: number): string {
  const run = "The run that made it stays used.";
  if (scheduled <= 0) return run;
  if (scheduled === 1) return `It is on your calendar once, and that slot goes too. ${run}`;
  return `It is on your calendar ${scheduled} times, and those slots go too. ${run}`;
}
