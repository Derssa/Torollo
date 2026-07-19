import fs from 'fs';
import path from 'path';
import { validateRoadmap } from './validateRoadmap';
import { Roadmap } from './roadmapTypes';

const EXAMPLE_PATH = path.resolve(__dirname, '__fixtures__/example-first-architecture.json');

/** Minimal valid roadmap used as a base for the invalid-input tests. */
function minimalRoadmap(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'test-roadmap',
    title: 'Test roadmap',
    description: 'A minimal roadmap for tests.',
    language: 'en',
    steps: [
      {
        id: 'first-step',
        title: 'First step',
        instruction: 'Do the thing.',
        validators: [{ type: 'container_running', params: { node: 'web' } }],
      },
    ],
  };
}

function expectInvalid(data: unknown): string[] {
  const result = validateRoadmap(data);
  expect(result.valid).toBe(false);
  if (result.valid) throw new Error('unreachable');
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors;
}

describe('validateRoadmap', () => {
  it('accepts a minimal valid roadmap', () => {
    const result = validateRoadmap(minimalRoadmap());
    expect(result).toEqual({ valid: true, roadmap: minimalRoadmap() });
  });

  describe('repository example roadmap', () => {
    const example = JSON.parse(fs.readFileSync(EXAMPLE_PATH, 'utf-8'));

    it('validates', () => {
      const result = validateRoadmap(example);
      expect(result).toMatchObject({ valid: true });
    });

    it('covers the V-1 acceptance criteria structurally', () => {
      const roadmap = example as Roadmap;
      expect(roadmap.steps.length).toBeGreaterThanOrEqual(2);
      expect(roadmap.steps.some((s) => (s.hints ?? []).length >= 2)).toBe(true);
      expect(
        roadmap.steps.some((s) => new Set(s.validators.map((v) => v.type)).size >= 2)
      ).toBe(true);
    });
  });

  describe('schemaVersion', () => {
    it('rejects a missing schemaVersion and names the field', () => {
      const data = minimalRoadmap();
      delete data.schemaVersion;
      const errors = expectInvalid(data);
      expect(errors.join('\n')).toContain('missing required field "schemaVersion"');
    });

    it('rejects an unsupported schemaVersion with an explicit message', () => {
      const errors = expectInvalid({ ...minimalRoadmap(), schemaVersion: 2 });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('/schemaVersion: unsupported schemaVersion 2');
      expect(errors[0]).toContain('reads schemaVersion 1');
    });
  });

  describe('error messages point at the faulty field', () => {
    it('names a missing required field with its path', () => {
      const data = minimalRoadmap();
      delete (data.steps as Record<string, unknown>[])[0].id;
      const errors = expectInvalid(data);
      expect(errors.join('\n')).toContain('/steps/0: missing required field "id"');
    });

    it('names an unknown field (typo detection)', () => {
      const data = minimalRoadmap();
      (data.steps as Record<string, unknown>[])[0].titel = 'typo';
      const errors = expectInvalid(data);
      expect(errors.join('\n')).toContain('/steps/0: unknown field "titel"');
    });

    it('points inside a validator missing its type', () => {
      const data = minimalRoadmap();
      (data.steps as Record<string, unknown>[])[0].validators = [{ params: {} }];
      const errors = expectInvalid(data);
      expect(errors.join('\n')).toContain(
        '/steps/0/validators/0: missing required field "type"'
      );
    });

    it('points at non-object validator params', () => {
      const data = minimalRoadmap();
      (data.steps as Record<string, unknown>[])[0].validators = [
        { type: 'container_running', params: 'web' },
      ];
      const errors = expectInvalid(data);
      expect(errors.join('\n')).toContain('/steps/0/validators/0/params');
    });
  });

  describe('step ids', () => {
    it('rejects duplicate step ids, naming the duplicate and both positions', () => {
      const data = minimalRoadmap();
      const step = (data.steps as Record<string, unknown>[])[0];
      data.steps = [step, { ...step }];
      const errors = expectInvalid(data);
      expect(errors).toEqual([
        '/steps/1/id: duplicate step id "first-step" (already used at /steps/0/id)',
      ]);
    });

    it('rejects a step id that is not a slug', () => {
      const data = minimalRoadmap();
      (data.steps as Record<string, unknown>[])[0].id = 'Not A Slug!';
      const errors = expectInvalid(data);
      expect(errors.join('\n')).toContain('/steps/0/id');
    });
  });

  describe('malformed inputs never throw', () => {
    it.each([
      ['null', null],
      ['an array', []],
      ['a string', 'roadmap'],
      ['a number', 42],
    ])('rejects %s as the root value', (_label, data) => {
      const errors = expectInvalid(data);
      expect(errors).toEqual(['(root): a roadmap must be a JSON object']);
    });

    it('rejects an empty steps array', () => {
      const errors = expectInvalid({ ...minimalRoadmap(), steps: [] });
      expect(errors.join('\n')).toContain('/steps');
    });

    it('rejects a step without validators', () => {
      const data = minimalRoadmap();
      (data.steps as Record<string, unknown>[])[0].validators = [];
      const errors = expectInvalid(data);
      expect(errors.join('\n')).toContain('/steps/0/validators');
    });
  });

  it('accepts a roadmap using all 8 v1 validator types with their documented params', () => {
    const allValidators = [
      { type: 'container_running', params: { node: 'web' } },
      { type: 'table_exists', params: { node: 'db', table: 'users' } },
      { type: 'redis_key_exists', params: { node: 'cache', key: 'session:*' } },
      { type: 'mongo_collection_exists', params: { node: 'docs-db', collection: 'orders' } },
      { type: 'edge_exists', params: { source: 'web', target: 'db', port: 5432 } },
      { type: 'lb_upstreams', params: { node: 'lb', min: 2 } },
      { type: 'port_denied', params: { source: 'web', target: 'db', port: 80 } },
      { type: 'asg_replicas', params: { node: 'workers', count: 3 } },
    ];
    const data = minimalRoadmap();
    (data.steps as Record<string, unknown>[])[0].validators = allValidators;
    expect(validateRoadmap(data)).toMatchObject({ valid: true });
  });
});
