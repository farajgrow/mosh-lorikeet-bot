/**
 * Deterministic safety classifier. Runs on every patient message BEFORE the model.
 * It is deliberately over-inclusive: a false positive costs a clinician a minute;
 * a false negative could hurt a patient. A model-based check runs as a second layer
 * (see selectSop) and the two are OR-ed together in code.
 */

export interface SafetyResult {
  urgent: boolean;
  clinical: boolean;
  injection: boolean;
  matches: { urgent: string[]; clinical: string[]; injection: string[] };
}

const URGENT: RegExp[] = [
  /chest (pain|tightness|pressure)/i,
  /chest (feels |is |going )?(tight|heavy|crushing|hurts|sore)/i,
  /(can'?t|cannot|can not|struggling to|hard to|trouble|difficulty) breath/i,
  /short(ness)? of breath/i,
  /suicid/i,
  /kill (myself|me)/i,
  /end (my|it all|my life)\b/i,
  /want(ing)? to die/i,
  /(self[- ]?harm|hurt(ing)? myself|harm myself)/i,
  /overdos/i,
  /took (too many|too much|a whole|the whole|all (of )?(my|the))/i,
  /swell(ing|ed|s)? (of |in |up )?(my )?(face|lips?|tongue|throat)/i,
  /(face|lips?|tongue|throat) (is |are )?(swelling|swollen)/i,
  /swollen (face|lips?|tongue|throat)/i,
  /anaphyla/i,
  /(passed out|fainted|fainting|unconscious|blacked out)/i,
  /seizure/i,
  /(sudden|lost|losing|loss of) (vision|sight)/i,
  /can'?t see/i,
  /erection (that )?(won'?t go|has lasted|lasting|for (over |more than )?[4-9] hours)/i,
  /priapism/i,
  /(severe|heavy|won'?t stop) bleeding/i,
  /stroke/i,
  /heart (is )?(racing|pounding)/i,
  /(numb|weak)(ness)? (in|on) (one|my) (side|arm|face)/i,
];

const CLINICAL: RegExp[] = [
  /\bdos(e|es|age|ing)\b/i,
  /side[- ]?effects?/i,
  /symptoms?/i,
  /interact(ion|s)?/i,
  /\b(can|should|could|may) i (take|drink|mix|combine|stop taking|start taking|double|increase|decrease|split|skip a dose)/i,
  /\bis (it|this|that) (safe|normal|dangerous)\b/i,
  /\bsafe to\b/i,
  /(two|2|double|extra|more|another|half) (tablets?|pills?|doses?|capsules?|injections?|jabs?)/i,
  /stop taking/i,
  /(should|do) i (need to )?stop (taking|using|my (treatment|medication|meds|tablets))/i,
  /missed (a |my )?(dose|tablet|pill|injection)/i,
  /\b(headaches?|nausea|nauseous|vomit|dizz|rash|itch|acne flare|shedding|blurred|palpitations|cramps?)\w*/i,
  /\b(pregnan|breastfeed|breast-feed|trying for a baby)\w*/i,
  /\b(alcohol|drinking|beer|wine)\b.*\b(with|on|while)\b/i,
  /\b(with|on|while)\b.*\b(alcohol|drinking)\b/i,
  /(other|another|my other|with my) (medication|meds|medicine|prescription)s?/i,
  /(higher|lower|stronger|weaker|different) (dose|strength|medication)/i,
  /\b(increase|decrease|change|adjust) (my )?(dose|dosage|medication|treatment)/i,
  /medical advice/i,
  /\b(feel|feeling) (sick|unwell|worse|weird|strange|off)\b/i,
  /\b(allerg)\w*/i,
  /\b(is|are) (this|these|it) (working|normal)\b/i,
  /\bnot working\b.*\b(treatment|medication|tablets?|pills?)\b/i,
  /\bblood pressure\b/i,
];

const INJECTION: RegExp[] = [
  /ignore (all |any |your |the |previous |prior |above )*(rules|instructions|polic(y|ies)|guidelines|prompt)/i,
  /disregard (your|the|all|previous)/i,
  /system prompt/i,
  /you are now/i,
  /developer mode/i,
  /\bjailbreak/i,
  /pretend (you|to be)/i,
  /\b(override|bypass)\b/i,
  /\bact as\b/i,
  /(i am|i'?m) (an? )?(admin|administrator|manager|supervisor|developer|doctor at mosh|staff)/i,
  /(already )?(been )?(pre-?)?approved by/i,
  /\[?system\]?:/i,
  /new instructions/i,
];

function hits(text: string, patterns: RegExp[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) out.push(m[0]);
  }
  return out;
}

export function classifyMessage(text: string): SafetyResult {
  const urgent = hits(text, URGENT);
  const clinical = hits(text, CLINICAL);
  const injection = hits(text, INJECTION);
  return {
    urgent: urgent.length > 0,
    clinical: clinical.length > 0 || urgent.length > 0,
    injection: injection.length > 0,
    matches: { urgent, clinical, injection },
  };
}
