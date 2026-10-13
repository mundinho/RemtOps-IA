/**
 * Language guardrail for agent-written text about people.
 *
 * Policy: the system reports ANOMALIES that need review — it never concludes misconduct.
 * Even if the model writes "fraud" or "theft", the text is neutralised before it reaches an
 * alert, a review or a notification, and the correction is recorded.
 */
const ACCUSATORY_TERMS =
  /\b(fraud(?:ulent|ster|s)?|fraude(?:s)?|fraudulent[ao]s?|theft|thief|stole(?:n)?|steal(?:ing)?|roubo|roubou|ladr[aã]o|burla|scam(?:mer)?|criminal|crime|dishonest|desonest[oa])\b/gi;

export interface GuardedText {
  text: string;
  /** Terms that were replaced (empty when the text was already neutral). */
  replaced: string[];
}

export function neutraliseAccusations(text: string): GuardedText {
  const replaced: string[] = [];
  const neutral = text.replace(ACCUSATORY_TERMS, (match) => {
    replaced.push(match);
    return 'anomaly';
  });
  return { text: neutral, replaced };
}
