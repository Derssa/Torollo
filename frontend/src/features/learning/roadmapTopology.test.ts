import { describe, it, expect } from 'vitest';
import { deriveTopology } from './roadmapTopology';
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

describe('deriveTopology', () => {
  it('lists nodes in the order the roadmap first checks them', () => {
    const { nodes } = deriveTopology(
      roadmapOf([
        [{ type: 'container_running', params: { node: 'web' } }],
        [{ type: 'container_running', params: { node: 'db' } }],
        [{ type: 'edge_exists', params: { source: 'web', target: 'cache', port: 6379 } }],
      ])
    );

    expect(nodes.map(n => n.name)).toEqual(['web', 'db', 'cache']);
  });

  it('gives a node the role of the strongest check targeting it', () => {
    const { nodes } = deriveTopology(
      roadmapOf([
        [
          { type: 'container_running', params: { node: 'db' } },
          { type: 'http_get_contains', params: { node: 'web', port: 80, path: '/', expectedText: 'hi' } },
        ],
        [
          // A store's identity must win over the generic checks around it.
          { type: 'table_exists', params: { node: 'db', table: 'books' } },
          { type: 'container_running', params: { node: 'web' } },
        ],
      ])
    );

    expect(nodes).toEqual([
      { name: 'db', role: 'postgres' },
      { name: 'web', role: 'httpService' },
    ]);
  });

  it('reads connectivity checks as allow and deny links, deduplicated', () => {
    const { links } = deriveTopology(
      roadmapOf([
        [
          { type: 'edge_exists', params: { source: 'web', target: 'db', port: 5432 } },
          { type: 'edge_exists', params: { source: 'web', target: 'db', port: 5432 } },
          { type: 'edge_exists', params: { source: 'web', target: 'cache' } },
        ],
        [{ type: 'port_denied', params: { source: 'cache', target: 'db', port: 5432 } }],
      ])
    );

    expect(links).toEqual([
      { source: 'web', target: 'db', port: 5432, mode: 'allow' },
      { source: 'web', target: 'cache', port: undefined, mode: 'allow' },
      { source: 'cache', target: 'db', port: 5432, mode: 'deny' },
    ]);
  });

  it('derives skills once each, capped at six', () => {
    const { skills } = deriveTopology(
      roadmapOf([
        [
          { type: 'container_running', params: { node: 'web' } },
          { type: 'container_running', params: { node: 'db' } },
          { type: 'table_exists', params: { node: 'db', table: 'books' } },
          { type: 'edge_exists', params: { source: 'web', target: 'db', port: 5432 } },
          { type: 'redis_key_exists', params: { node: 'cache', key: 'k' } },
          { type: 'port_denied', params: { source: 'cache', target: 'db', port: 5432 } },
          { type: 'http_get_contains', params: { node: 'web', port: 80, path: '/', expectedText: 'hi' } },
          { type: 'lb_upstreams', params: { node: 'lb', min: 2 } },
        ],
      ])
    );

    expect(skills).toEqual(['containers', 'sql', 'networking', 'redis', 'securityGroups', 'httpServices']);
  });

  it('keeps nodes of unknown validator types without guessing a role', () => {
    const { nodes, links, skills } = deriveTopology(
      roadmapOf([
        [
          { type: 'community_custom_check', params: { node: 'kafka', topic: 'orders' } },
          { type: 'community_link_check', params: { source: 'web', target: 'kafka' } },
        ],
      ])
    );

    expect(nodes).toEqual([
      { name: 'kafka', role: 'container' },
      { name: 'web', role: 'container' },
    ]);
    // Only the engine's own connectivity checks describe firewall intent.
    expect(links).toEqual([]);
    expect(skills).toEqual([]);
  });

  it('ignores params of the wrong type instead of rendering them', () => {
    const { nodes, links } = deriveTopology(
      roadmapOf([
        [
          { type: 'container_running', params: { node: 42 } },
          { type: 'edge_exists', params: { source: 'web', target: 'db', port: '5432' } },
        ],
      ])
    );

    expect(nodes.map(n => n.name)).toEqual(['web', 'db']);
    expect(links).toEqual([{ source: 'web', target: 'db', port: undefined, mode: 'allow' }]);
  });
});
