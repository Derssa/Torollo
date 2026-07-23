/**
 * The sample receipts shown on the learning page. Always presented under a
 * "Sample validation receipt" label — they illustrate what a real validation
 * receipt looks like (style drawn from the cache-aside-redis roadmap) and
 * must never masquerade as a live result. Hero and why-panel show different
 * checks so the same block never appears twice on one screen.
 */
export const HERO_RECEIPT_LINES = [
  'checked: redis-cli GET book:42:title',
  '→ "Clean Architecture"',
];

export const WHY_RECEIPT_LINES = [
  'checked: container "redis-cache" running',
  '→ up, port 6379 → localhost:56379',
];
