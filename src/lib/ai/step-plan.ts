/**
 * Which obligation the conversation is working on, and how it is put to the
 * model.
 *
 * The complaint this answers is that guidance arrives as one wall of every
 * step at once. Pacing it by prompt alone does not hold: nothing stops a model
 * from skipping a step, repeating one, or quietly reordering them, and the
 * administrator has no way to tell that it did.
 *
 * So the order is decided here, from the `ComplianceAction` rows the
 * classification already created, and the model is told which single step is
 * current. The system is deterministic about *which* step; the model is left
 * to explain it.
 *
 * `dueDate` ascending with nulls last, tie-broken on `id`. Ordered rather than
 * found: two obligations sharing a deadline must not swap places between turns
 * because the query planner felt differently, or the conversation would appear
 * to go backwards.
 */

export interface PlannableObligation {
  id: string;
  actionType: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
}

/** Anything not yet discharged. `overdue` is a deadline state, not a closure. */
const OPEN_STATUSES = new Set(['pending', 'in_progress', 'overdue']);

export function orderOpenSteps(obligations: PlannableObligation[]): PlannableObligation[] {
  return obligations
    .filter(o => OPEN_STATUSES.has(o.status))
    .sort((a, b) => {
      const at = a.dueDate?.getTime();
      const bt = b.dueDate?.getTime();
      if (at !== bt) {
        if (at === undefined) return 1;
        if (bt === undefined) return -1;
        return at - bt;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * What an obligation is called, everywhere it is named.
 *
 * There were four spellings of this — the plan, the notification feed, the
 * obligation row and the incident page — and the two in components had already
 * drifted: neither trimmed, and neither replaced the underscores, so the bell
 * said `general action` where the queue said `general_action` and a
 * whitespace-only description rendered as nothing at all.
 *
 * The parameter is structural rather than `PlannableObligation` so a row from
 * any of those callers fits without being reshaped first.
 */
export function stepLabel(step: { description: string | null; actionType: string }): string {
  const description = step.description?.trim();
  if (description) return description;
  return step.actionType.replace(/_/g, ' ');
}

/**
 * The block the model reads.
 *
 * Deadlines go as ISO instants. They are read by the model, not by the
 * administrator, so the rule that times are formatted in the reader's zone
 * does not apply -- and a bare "Sept 14" would be ambiguous by a day either
 * side of midnight.
 *
 * Empty when nothing is open: an incident with no obligations yet, or one
 * where every step is discharged, must not be handed a plan that says so at
 * length.
 */
export function renderStepPlan(steps: PlannableObligation[]): string {
  if (steps.length === 0) return '';

  const lines = steps.map((step, index) => {
    const marker = index === 0 ? ' [CURRENT STEP]' : '';
    const due = step.dueDate
      ? `due ${step.dueDate.toISOString()}`
      : 'no deadline recorded';
    return `${index + 1}.${marker} ${stepLabel(step)} — ${due}`;
  });

  return `OPEN OBLIGATIONS FOR THIS INCIDENT, in the order they must be worked:
${lines.join('\n')}`;
}
