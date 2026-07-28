import type { ReceiptCheck } from '../../../../shared/components/Receipt';

/**
 * The sample receipt shown on the learning page. Always presented under a
 * "Sample validation receipt" title — it illustrates what a real receipt looks
 * like and must never masquerade as a live result. One per screen.
 *
 * Every row mirrors an actual validator of the `cache-aside-redis` roadmap
 * (`container_running`, `edge_exists`, `port_denied`, `http_get_contains`,
 * `redis_key_exists`) — nothing here is a capability Torollo doesn't have.
 *
 * The transcript is deliberately **not translated**: it is machine output, and
 * the terse tokens are what keeps the value column narrow enough to align.
 * Only the chrome around it (title, verdict) goes through i18n.
 */
export const SAMPLE_CONTEXT = 'cache-aside-redis · step 6/8 · cache-aside';

export const SAMPLE_CHECKS: ReceiptCheck[] = [
  { label: 'container "cache" running', value: 'up 4m' },
  { label: 'web → cache :6379', value: 'ALLOW' },
  { label: 'cache → db :5432', value: 'DENY' },
  { label: 'GET / contains "Nimbus Books"', value: '200 OK' },
  { label: 'redis key "cache:books"', value: 'EXISTS' },
];

export const SAMPLE_FOOTER = `${SAMPLE_CHECKS.length}/${SAMPLE_CHECKS.length} checks passed`;

/** The same receipt as plain text, for the copy button. */
export const SAMPLE_RECEIPT_TEXT = [
  SAMPLE_CONTEXT,
  ...SAMPLE_CHECKS.map(({ label, value }) => `✓ ${label.padEnd(34)}${value}`),
  SAMPLE_FOOTER,
].join('\n');
