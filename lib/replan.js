/**
 * Relaxation ladder for the replan step.
 *
 * When a taste-insights call returns zero entities, the agent relaxes its
 * signal one rung at a time instead of silently swapping to mock data.
 * Each rung drops one more signal key, in this order:
 *   1. drop audience signal
 *   2. drop tag signal
 *   3. drop age signal
 * A signal with only `entities` yields `[]` (nothing left to relax).
 *
 * @param {object} signal { audiences?, tags?, age?, location?, entities? }
 * @returns {{ signal: object, note: string }[]}
 */
export function relaxationLadder(signal) {
  const ladders = [];
  const s0 = { ...signal };

  if (s0.audiences?.length) {
    const s1 = { ...s0 };
    delete s1.audiences;
    ladders.push({ signal: s1, note: "dropped audience signal" });
  }
  if (s0.tags?.length) {
    const s2 = { ...(ladders.length ? ladders[ladders.length - 1].signal : s0) };
    delete s2.tags;
    ladders.push({ signal: s2, note: "dropped tag signal" });
  }
  if (s0.age) {
    const s3 = { ...(ladders.length ? ladders[ladders.length - 1].signal : s0) };
    delete s3.age;
    ladders.push({ signal: s3, note: "dropped age signal" });
  }
  return ladders;
}
