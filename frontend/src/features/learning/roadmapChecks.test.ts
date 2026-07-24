import { describe, it, expect } from 'vitest';
import { deriveSampleChecks } from './roadmapChecks';
import type { Roadmap, RoadmapValidator } from '../../shared/types/roadmap';

function roadmapOf(validatorsPerStep: RoadmapValidator[][]): Roadmap {
  return {
    schemaVersion: 1,
    id: 'test-roadmap',
    title: 'Test roadmap',
    description: 'A roadmap.',
    language: 'en',
    steps: validatorsPerStep.map((validators, i) => ({
      id: `step-${i}`,
      title: `Step ${i}`,
      instruction: 'Do it.',
      validators,
    })),
  };
}

describe('deriveSampleChecks', () => {
  it('describes the first checks in play order, one line each', () => {
    const lines = deriveSampleChecks(
      roadmapOf([
        [{ type: 'container_running', params: { node: 'web' } }],
        [{ type: 'table_exists', params: { node: 'db', table: 'books' } }],
        [{ type: 'edge_exists', params: { source: 'web', target: 'db', port: 5432 } }],
      ])
    );

    expect(lines).toEqual([
      { key: 'learning.detail.check.containerRunning', params: { node: 'web' } },
      { key: 'learning.detail.check.tableExists', params: { node: 'db', table: 'books' } },
      {
        key: 'learning.detail.check.edgeAllowedPort',
        params: { source: 'web', target: 'db', port: 5432 },
      },
    ]);
  });

  it('drops repeated checks and stops at the limit', () => {
    const lines = deriveSampleChecks(
      roadmapOf([
        [
          { type: 'container_running', params: { node: 'web' } },
          { type: 'container_running', params: { node: 'web' } },
          { type: 'container_running', params: { node: 'db' } },
        ],
      ]),
      2
    );

    expect(lines.map(l => l.params.node)).toEqual(['web', 'db']);
  });

  it('uses the portless phrasing when a link check accepts any port', () => {
    const [line] = deriveSampleChecks(
      roadmapOf([[{ type: 'edge_exists', params: { source: 'web', target: 'cache' } }]])
    );

    expect(line.key).toBe('learning.detail.check.edgeAllowed');
  });

  it('skips validators it cannot describe rather than inventing a line', () => {
    const lines = deriveSampleChecks(
      roadmapOf([
        [
          { type: 'community_custom_check', params: { node: 'kafka' } },
          { type: 'table_exists', params: { node: 'db' } },
          { type: 'redis_key_exists', params: { node: 'cache', key: 'cache:books' } },
        ],
      ])
    );

    expect(lines).toEqual([
      {
        key: 'learning.detail.check.redisKey',
        params: { node: 'cache', redisKey: 'cache:books' },
      },
    ]);
  });
});
