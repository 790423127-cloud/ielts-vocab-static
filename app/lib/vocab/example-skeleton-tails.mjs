export const EXAMPLE_SKELETON_TAIL_PATTERNS = [
  /\band keep the receipt\b/i,
  /\band bring photo ID\b/i,
  /\band call the helpline\b/i,
  /\band check the website\b/i,
  /\band speak to reception\b/i,
  /\band wait for email\b/i,
  /\band save the reference\b/i,
  /\band read the leaflet\b/i,
  /\band follow the signage\b/i,
  /\band use the online form\b/i,
  /\band attach the invoice\b/i,
  /\band confirm your address\b/i,
  /\band note the closing time\b/i,
  /\band ask for assistance\b/i,
  /\band review the checklist\b/i,
  /\band print the ticket\b/i,
  /\band queue at desk two\b/i,
  /\band update your details\b/i,
  /\band sign the register\b/i,
  /\band collect the token\b/i,
  /\bthen contact the manager\b/i,
  /\bthen visit the helpdesk\b/i,
  /\bthen complete section B\b/i,
  /\bthen return the form\b/i,
  /\bthen keep a copy\b/i,
  /\bthen notify your supervisor\b/i,
  /\bthen check your inbox\b/i,
  /\bthen record the case number\b/i,
  /\bthen choose a later slot\b/i,
  /\bthen pay at the counter\b/i,
  /\bthen show your membership card\b/i,
  /\bthen wait in the lobby\b/i,
  /\bbecause the office closes early\b/i,
  /\bbecause staff are training today\b/i,
  /\bbecause the system is updating\b/i,
  /\bif you need language support\b/i,
  /\bif you travel with children\b/i,
  /\bif you use a wheelchair\b/i,
  /\bif you paid online\b/i,
  /\bwhen the building reopens\b/i,
  /\bwhen the queue is shorter\b/i,
  /\bwhen the adviser is free\b/i,
  /\bwhen the form is signed\b/i,
  /\bwhile the claim is processed\b/i,
  /\bwhile the repair continues\b/i,
  /\bwhile tickets last\b/i,
  /\bbefore the payment is due\b/i,
  /\bbefore the course begins\b/i,
  /\bbefore the gate closes\b/i,
  /\bafter the safety briefing\b/i,
  /\bafter the refund is approved\b/i,
  /\bafter the meeting finishes\b/i
];

export function countExampleSkeletonTailHits(example = "") {
  const text = String(example || "");
  return EXAMPLE_SKELETON_TAIL_PATTERNS.reduce((count, pattern) => (
    pattern.test(text) ? count + 1 : count
  ), 0);
}

export function findFirstExampleSkeletonTailIndex(example = "") {
  const text = String(example || "");
  let firstIndex = -1;

  for (const pattern of EXAMPLE_SKELETON_TAIL_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (firstIndex < 0 || match.index < firstIndex) {
      firstIndex = match.index;
    }
  }

  return firstIndex;
}

export function stripExampleSkeletonTails(example = "") {
  const text = String(example || "").trim();
  if (!text) return "";

  const firstIndex = findFirstExampleSkeletonTailIndex(text);
  if (firstIndex < 0) return text;

  let cleaned = text.slice(0, firstIndex).trim();
  cleaned = cleaned.replace(/[;,:\s]+$/u, "").trim();
  if (!cleaned.endsWith(".")) cleaned += ".";
  return cleaned;
}

export function isCorruptedExampleSkeleton(example = "") {
  const text = String(example || "").trim();
  if (!text) return false;
  return countExampleSkeletonTailHits(text) > 0;
}