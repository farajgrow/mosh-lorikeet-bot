/**
 * Output filter: last line of defence on every agent reply.
 * Catches medical advice that slipped past the prompt (e.g. "you can take two tablets").
 */

const LEAD = String.raw`(you (can|could|should|may|might want to)|it'?s (fine|ok|okay|safe)|it is (fine|ok|okay|safe)|safe to|feel free to|i('d| would)? (recommend|suggest)|try)`;
const VERB = String.raw`(take|taking|double|increase|reduce|lower|raise|halve|split|stop|continue|skip|use|apply|inject)`;
const MED = String.raw`(dose|doses|dosage|tablets?|pills?|capsules?|medications?|medicine|mg|injections?|jabs?|cream|treatment)`;

const ADVICE: RegExp[] = [
  new RegExp(String.raw`\b${LEAD}\W+(?:\w+\W+){0,4}?${VERB}\W+(?:\w+\W+){0,4}?${MED}\b`, "i"),
  /\b(side effects?|symptoms?)\b[^.]{0,50}\b(are|is) (normal|common|expected|usually mild|temporary)\b/i,
  /\b(should|will usually|tends? to) (pass|go away|settle|subside|wear off)\b/i,
  /\bnothing to worry about\b/i,
  /\b(it'?s|that'?s|this is) (perfectly |completely |totally )?(normal|common) (to|for|when)\b/i,
  /\bno (known )?interaction/i,
];

export function detectMedicalAdvice(reply: string): string[] {
  const out: string[] = [];
  for (const p of ADVICE) {
    const m = reply.match(p);
    if (m) out.push(m[0]);
  }
  return out;
}
