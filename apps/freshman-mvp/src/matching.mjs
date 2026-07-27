export function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function bigrams(value) {
  const text = normalizeText(value);
  if (text.length < 2) return new Set(text ? [text] : []);
  const result = new Set();
  for (let index = 0; index < text.length - 1; index += 1) {
    result.add(text.slice(index, index + 2));
  }
  return result;
}

function dice(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return (2 * common) / (a.size + b.size);
}

function scoreEntry(question, entry) {
  const normalizedQuestion = normalizeText(question);
  const excluded = (entry.excludeKeywords || [])
    .map(normalizeText)
    .filter(Boolean)
    .some((keyword) => normalizedQuestion.includes(keyword));
  if (excluded) return 0;
  const candidates = [entry.question, ...(entry.aliases || [])].filter(Boolean);
  let similarity = 0;
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate);
    if (normalizedQuestion === normalizedCandidate) return 1;
    const containment = normalizedQuestion.includes(normalizedCandidate)
      || normalizedCandidate.includes(normalizedQuestion);
    similarity = Math.max(similarity, dice(question, candidate) + (containment ? 0.16 : 0));
  }
  const keywords = (entry.keywords || []).map(normalizeText).filter(Boolean);
  const matched = keywords.filter((keyword) => normalizedQuestion.includes(keyword)).length;
  const keywordScore = keywords.length ? matched / Math.min(keywords.length, 3) : 0;
  const intentKeywords = (entry.intentKeywords || []).map(normalizeText).filter(Boolean);
  const intentMatched = intentKeywords.length === 0
    || intentKeywords.some((keyword) => normalizedQuestion.includes(keyword));
  const intentFactor = intentMatched ? 1 : 0.45;
  return Math.min((0.76 * similarity + 0.24 * keywordScore) * intentFactor, 1);
}

export function bestMatch(question, entries, threshold = 0.5) {
  let best = null;
  for (const entry of entries || []) {
    const score = scoreEntry(question, entry);
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= threshold ? best : null;
}
