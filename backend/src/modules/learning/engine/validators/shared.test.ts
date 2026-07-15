import { resolveRunningContainer, resolveSourceAndTarget } from './shared';
import { ContainerInfo } from '../../../../infrastructure/docker/providers/containerProvider';

function makeContainer(overrides: Partial<ContainerInfo>): ContainerInfo {
  return {
    id: 'abc123',
    name: 'db',
    image: 'postgres:15-alpine',
    state: 'running',
    status: 'Up 2 minutes',
    type: 'postgres',
    ...overrides,
  };
}

describe('resolveRunningContainer', () => {
  it('resolves a running container of an expected type', () => {
    const result = resolveRunningContainer([makeContainer({})], 'db', ['postgres'], 'PostgreSQL');

    expect('container' in result && result.container.id).toBe('abc123');
  });

  it('fails when no container has the given name', () => {
    const result = resolveRunningContainer([], 'db', ['postgres'], 'PostgreSQL');

    expect('outcome' in result && result.outcome).toMatchObject({
      status: 'fail',
      observed: 'no container with that name',
    });
  });

  it('fails when the container is of the wrong type', () => {
    const result = resolveRunningContainer(
      [makeContainer({ type: 'redis' })],
      'db',
      ['postgres'],
      'PostgreSQL'
    );

    expect('outcome' in result && result.outcome).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('not a PostgreSQL node'),
      observed: 'a redis node',
    });
  });

  it('fails when the container exists but is not running', () => {
    const result = resolveRunningContainer(
      [makeContainer({ state: 'exited' })],
      'db',
      ['postgres'],
      'PostgreSQL'
    );

    expect('outcome' in result && result.outcome).toMatchObject({
      status: 'fail',
      observed: 'exited',
    });
  });
});

describe('resolveSourceAndTarget', () => {
  it('resolves both containers regardless of running state', () => {
    const source = makeContainer({ id: 'src-1', name: 'web', state: 'exited' });
    const target = makeContainer({ id: 'dst-1', name: 'db' });

    const result = resolveSourceAndTarget([source, target], 'web', 'db');

    expect('sourceContainer' in result && result.sourceContainer.id).toBe('src-1');
    expect('sourceContainer' in result && result.targetContainer.id).toBe('dst-1');
  });

  it('fails when the source container is missing', () => {
    const target = makeContainer({ name: 'db' });

    const result = resolveSourceAndTarget([target], 'web', 'db');

    expect('outcome' in result && result.outcome).toMatchObject({
      status: 'fail',
      observed: '"web" does not exist',
    });
  });

  it('fails when the target container is missing', () => {
    const source = makeContainer({ name: 'web' });

    const result = resolveSourceAndTarget([source], 'web', 'db');

    expect('outcome' in result && result.outcome).toMatchObject({
      status: 'fail',
      observed: '"db" does not exist',
    });
  });
});
