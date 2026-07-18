import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectService } from './projectService';
import { ProjectStore } from './projectStore';
import { NetworkService } from '../../network/services/networkService';
import { ProgressService } from '../../learning/services/progressService';
import { containerProvider } from '../../../infrastructure/docker/providers/dockerContainerProvider';

jest.mock('../../network/services/networkService', () => ({
  NetworkService: {
    cleanupProjectNetwork: jest.fn().mockResolvedValue(undefined)
  }
}));
jest.mock('../../learning/services/progressService', () => ({
  ProgressService: {
    deleteProjectProgress: jest.fn()
  }
}));
jest.mock('../../../infrastructure/docker/providers/dockerContainerProvider', () => ({
  containerProvider: {
    listContainersByProject: jest.fn().mockResolvedValue([]),
    deleteContainer: jest.fn().mockResolvedValue(undefined)
  }
}));

const mutate = (fn: (store: ProjectStore) => unknown, file: string): Promise<unknown> =>
  (ProjectService as unknown as {
    mutate: (fn: (store: ProjectStore) => unknown, file: string) => Promise<unknown>;
  }).mutate.call(ProjectService, fn, file);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('ProjectService', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    jest.clearAllMocks();
    (NetworkService.cleanupProjectNetwork as jest.Mock).mockResolvedValue(undefined);
    (containerProvider.listContainersByProject as jest.Mock).mockResolvedValue([]);
    (containerProvider.deleteContainer as jest.Mock).mockResolvedValue(undefined);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torollo-projects-'));
    file = path.join(dir, 'projects.json');
    (ProjectService as unknown as { storeRecovered: boolean }).storeRecovered = false;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list without creating the file when nothing was ever stored', async () => {
    const projects = await ProjectService.listProjects(file);

    expect(projects).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
    expect(ProjectService.consumeStoreRecovered()).toBe(false);
  });

  it('persists projects in the versioned envelope, atomically', async () => {
    const created = await ProjectService.createProject('My Lab', file);

    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(stored).toEqual({ version: 1, projects: [created] });
    expect(created.name).toBe('My Lab');
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('reads the legacy bare-array format and upgrades it on the next write', async () => {
    const legacy = [{ id: 'project-1', name: 'Old', createdAt: '2026-07-01T00:00:00.000Z' }];
    fs.writeFileSync(file, JSON.stringify(legacy));

    const projects = await ProjectService.listProjects(file);
    expect(projects).toEqual(legacy);
    expect(fs.existsSync(`${file}.corrupt`)).toBe(false);
    expect(ProjectService.consumeStoreRecovered()).toBe(false);

    await ProjectService.saveNetworkConfig('project-1', { subnets: [] }, file);

    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(stored.version).toBe(1);
    expect(stored.projects).toHaveLength(1);
    expect(stored.projects[0].id).toBe('project-1');
    expect(stored.projects[0].networkConfig).toEqual({ subnets: [] });
  });

  it('moves an unparseable store aside and reports it once, never a silent empty list', async () => {
    fs.writeFileSync(file, 'not json {');

    const projects = await ProjectService.listProjects(file);

    expect(projects).toEqual([]);
    expect(fs.readFileSync(`${file}.corrupt`, 'utf-8')).toBe('not json {');
    expect(ProjectService.consumeStoreRecovered()).toBe(true);
    expect(ProjectService.consumeStoreRecovered()).toBe(false);
  });

  it('treats an unknown store version as unreadable, never guesses', async () => {
    fs.writeFileSync(file, JSON.stringify({ version: 99, projects: [] }));

    const projects = await ProjectService.listProjects(file);

    expect(projects).toEqual([]);
    expect(fs.existsSync(`${file}.corrupt`)).toBe(true);
    expect(ProjectService.consumeStoreRecovered()).toBe(true);
  });

  it('ignores a leftover .tmp crash artifact and overwrites it on the next write', async () => {
    await ProjectService.createProject('Survivor', file);
    fs.writeFileSync(`${file}.tmp`, 'half-written garbage');

    const projects = await ProjectService.listProjects(file);
    expect(projects.map(p => p.name)).toEqual(['Survivor']);

    await ProjectService.createProject('Second', file);
    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(stored.projects.map((p: { name: string }) => p.name)).toEqual(['Survivor', 'Second']);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('keeps the previous valid store when the atomic rename fails mid-write', async () => {
    const first = await ProjectService.createProject('Kept', file);

    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('simulated crash during rename');
    });
    await expect(ProjectService.createProject('Lost', file)).rejects.toThrow('simulated crash');
    renameSpy.mockRestore();

    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(stored).toEqual({ version: 1, projects: [first] });
  });

  it('serializes concurrent read-modify-write transactions (no lost update)', async () => {
    await Promise.all([
      mutate(async store => {
        const count = store.projects.length;
        await delay(20);
        store.projects.push({ id: `slow-${count}`, name: `Slow ${count}`, createdAt: '' });
      }, file),
      mutate(async store => {
        const count = store.projects.length;
        await delay(5);
        store.projects.push({ id: `fast-${count}`, name: `Fast ${count}`, createdAt: '' });
      }, file)
    ]);

    // Without the queue, both transactions read length 0 and the second
    // write clobbers the first — here both entries land, in FIFO order.
    const projects = await ProjectService.listProjects(file);
    expect(projects.map(p => p.id)).toEqual(['slow-0', 'fast-1']);
  });

  it('keeps every project from a burst of concurrent creations', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => ProjectService.createProject(`Project ${i}`, file))
    );

    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(stored.projects).toHaveLength(10);
  });

  it('does not poison the queue when a transaction throws', async () => {
    await expect(
      mutate(() => {
        throw new Error('boom');
      }, file)
    ).rejects.toThrow('boom');

    const created = await ProjectService.createProject('After failure', file);
    expect((await ProjectService.listProjects(file)).map(p => p.id)).toEqual([created.id]);
  });

  it('deletes a project along with its network, progress and containers, leaving others intact', async () => {
    // Explicit ids: createProject derives ids from Date.now(), which can
    // collide for back-to-back creations and would make this test flaky.
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      projects: [
        { id: 'project-keep', name: 'Keep', createdAt: '' },
        { id: 'project-target', name: 'Target', createdAt: '', networkConfig: { subnets: [{ id: 'subnet-1' }] } }
      ]
    }));
    (containerProvider.listContainersByProject as jest.Mock).mockResolvedValue([{ id: 'c1' }]);

    await ProjectService.deleteProject('project-target', file);

    expect((await ProjectService.listProjects(file)).map(p => p.id)).toEqual(['project-keep']);
    expect(NetworkService.cleanupProjectNetwork).toHaveBeenCalledWith(
      'project-target',
      { subnets: [{ id: 'subnet-1' }] }
    );
    expect(ProgressService.deleteProjectProgress).toHaveBeenCalledWith('project-target');
    expect(containerProvider.deleteContainer).toHaveBeenCalledWith('c1');
  });

  it('does not clobber a project created while a slow deletion is doing Docker work', async () => {
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      projects: [{ id: 'project-target', name: 'Target', createdAt: '', networkConfig: { subnets: [] } }]
    }));
    let releaseCleanup: () => void = () => undefined;
    (NetworkService.cleanupProjectNetwork as jest.Mock).mockImplementation(
      () => new Promise<void>(resolve => { releaseCleanup = resolve; })
    );

    const deletion = ProjectService.deleteProject('project-target', file);
    await delay(5); // let the deletion reach the pending network cleanup
    const created = await ProjectService.createProject('Concurrent', file);
    releaseCleanup();
    await deletion;

    // The delete transaction re-reads the store, so the concurrent project
    // survives instead of being overwritten by a stale snapshot.
    expect((await ProjectService.listProjects(file)).map(p => p.id)).toEqual([created.id]);
  });

  it('saveNetworkConfig on an unknown project is a harmless no-op', async () => {
    const existing = await ProjectService.createProject('Existing', file);

    await ProjectService.saveNetworkConfig('project-unknown', { subnets: [] }, file);

    expect(await ProjectService.getNetworkConfig('project-unknown', file)).toBeNull();
    expect((await ProjectService.listProjects(file))).toEqual([existing]);
  });

  it('round-trips a network config through save and get', async () => {
    const project = await ProjectService.createProject('Networked', file);
    const config = { subnets: [{ id: 'subnet-1', cidr: '10.0.1.0/24' }], nodeSubnetMap: { n1: 'subnet-1' } };

    await ProjectService.saveNetworkConfig(project.id, config, file);

    expect(await ProjectService.getNetworkConfig(project.id, file)).toEqual(config);
  });
});
