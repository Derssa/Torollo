import docker from '../DockerClient';
import { ContainerNotFoundError } from '../dockerErrors';
import { DockerContainerProvider } from './dockerContainerProvider';

jest.mock('../DockerClient', () => ({
  __esModule: true,
  default: {
    getContainer: jest.fn()
  }
}));

describe('DockerContainerProvider.assertContainerInProject', () => {
  const provider = new DockerContainerProvider();

  function mockInspect(result: { labels?: Record<string, string> } | { rejectWith: unknown }) {
    const inspect =
      'rejectWith' in result
        ? jest.fn().mockRejectedValue(result.rejectWith)
        : jest.fn().mockResolvedValue({ Config: { Labels: result.labels } });
    (docker.getContainer as jest.Mock).mockReturnValue({ inspect });
    return inspect;
  }

  it('resolves when the container carries the requested project label', async () => {
    mockInspect({ labels: { 'akal.project.id': 'project-a' } });
    await expect(provider.assertContainerInProject('c1', 'project-a')).resolves.toBeUndefined();
  });

  it('throws ContainerNotFoundError when the container belongs to another project', async () => {
    mockInspect({ labels: { 'akal.project.id': 'project-b' } });
    await expect(provider.assertContainerInProject('c1', 'project-a')).rejects.toBeInstanceOf(ContainerNotFoundError);
  });

  it('throws ContainerNotFoundError when the container has no akal labels at all', async () => {
    mockInspect({ labels: { 'com.example.other': 'x' } });
    await expect(provider.assertContainerInProject('c1', 'project-a')).rejects.toBeInstanceOf(ContainerNotFoundError);
  });

  it('throws ContainerNotFoundError when Labels is undefined', async () => {
    mockInspect({ labels: undefined });
    await expect(provider.assertContainerInProject('c1', 'project-a')).rejects.toBeInstanceOf(ContainerNotFoundError);
  });

  it('throws ContainerNotFoundError when the container does not exist (inspect 404)', async () => {
    mockInspect({ rejectWith: { statusCode: 404, message: '(HTTP code 404) no such container' } });
    await expect(provider.assertContainerInProject('ghost', 'project-a')).rejects.toBeInstanceOf(ContainerNotFoundError);
  });

  it('refuses an empty projectId even if the container has a label (fail closed)', async () => {
    mockInspect({ labels: { 'akal.project.id': 'project-a' } });
    await expect(provider.assertContainerInProject('c1', '')).rejects.toBeInstanceOf(ContainerNotFoundError);
  });

  it('rethrows non-404 errors untouched (daemon down must not read as a 404)', async () => {
    const daemonDown = Object.assign(new Error('connect ECONNREFUSED /var/run/docker.sock'), { code: 'ECONNREFUSED' });
    mockInspect({ rejectWith: daemonDown });
    await expect(provider.assertContainerInProject('c1', 'project-a')).rejects.toBe(daemonDown);
  });
});
