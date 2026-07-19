import { AsgService } from './asgService';
import { ProjectService } from '../../projects/services/projectService';
import { NetworkService } from '../../network/services/networkService';
import { containerProvider } from '../../../infrastructure/docker/providers/dockerContainerProvider';
import docker from '../../../infrastructure/docker/DockerClient';

jest.mock('../../projects/services/projectService', () => ({
  ProjectService: {
    getNetworkConfig: jest.fn(),
    updateNetworkConfig: jest.fn()
  }
}));
jest.mock('../../network/services/networkService', () => ({
  NetworkService: {
    clearPolicyHash: jest.fn(),
    applyPolicy: jest.fn().mockResolvedValue(undefined)
  }
}));
jest.mock('../../../infrastructure/docker/providers/dockerContainerProvider', () => ({
  containerProvider: {
    createContainer: jest.fn(),
    deleteContainer: jest.fn().mockResolvedValue(undefined),
    listContainersByProject: jest.fn().mockResolvedValue([]),
    markAsCrashed: jest.fn(),
    assertContainerInProject: jest.fn().mockResolvedValue(undefined)
  }
}));
jest.mock('../../../infrastructure/docker/DockerClient', () => ({
  __esModule: true,
  default: { listContainers: jest.fn() }
}));

const getNetworkConfig = ProjectService.getNetworkConfig as jest.Mock;
const updateNetworkConfig = ProjectService.updateNetworkConfig as jest.Mock;
const applyPolicy = NetworkService.applyPolicy as jest.Mock;
const listContainers = (docker as unknown as { listContainers: jest.Mock }).listContainers;
const createContainer = containerProvider.createContainer as jest.Mock;
const deleteContainer = containerProvider.deleteContainer as jest.Mock;
const assertContainerInProject = containerProvider.assertContainerInProject as jest.Mock;
const markAsCrashed = containerProvider.markAsCrashed as jest.Mock;

// The scaler updates the store through updateNetworkConfig(projectId, updater);
// run the updater against a seed so we can assert the exact delta it produced.
const runUpdaterAgainst = (seed: Record<string, unknown>) =>
  updateNetworkConfig.mockImplementation(async (_projectId, updater) => updater({ ...seed }));

const instance = (id: string, projectId: string, asgId: string, created: number) => ({
  Id: id,
  Created: created,
  Labels: {
    'akal.project.id': projectId,
    'akal.asg.id': asgId,
    'akal.asg.instance': 'true'
  }
});

describe('AsgService.scaleASG', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applyPolicy.mockResolvedValue(undefined);
    deleteContainer.mockResolvedValue(undefined);
    (containerProvider.listContainersByProject as jest.Mock).mockResolvedValue([]);
  });

  it('scales up, records the replica delta by key, and applies the merged config', async () => {
    getNetworkConfig.mockResolvedValue({ subnets: [{ id: 'sn-pub', type: 'public' }] });
    listContainers.mockResolvedValue([]);
    createContainer
      .mockResolvedValueOnce({ id: 'replica-1' })
      .mockResolvedValueOnce({ id: 'replica-2' });
    runUpdaterAgainst({ nodeSubnetMap: {}, asgReplicaNodes: [] });

    await AsgService.scaleASG('proj-1', 'asg-1', 2, ['sn-pub']);

    expect(createContainer).toHaveBeenCalledTimes(2);
    // Public subnet + custom image + ASG labels.
    expect(createContainer).toHaveBeenCalledWith(
      'proj-1', expect.any(String), 'ubuntu', true, expect.stringContaining(':latest'),
      { 'akal.asg.id': 'asg-1', 'akal.asg.instance': 'true' }
    );

    // Policy is applied with the merged config the transaction returned...
    const applied = applyPolicy.mock.calls[0][1];
    expect(applied.nodeSubnetMap).toEqual({ 'replica-1': 'sn-pub', 'replica-2': 'sn-pub' });
    expect(applied.asgReplicaNodes).toEqual(['replica-1', 'replica-2']);
  });

  it('only counts and touches this project\'s replicas', async () => {
    getNetworkConfig.mockResolvedValue({ subnets: [{ id: 'sn-pub', type: 'public' }] });
    // Another project already runs an instance under the same asg id — must be ignored.
    listContainers.mockResolvedValue([instance('other-rep', 'other-project', 'asg-1', 100)]);
    createContainer.mockResolvedValueOnce({ id: 'replica-1' });
    runUpdaterAgainst({ nodeSubnetMap: {}, asgReplicaNodes: [] });

    await AsgService.scaleASG('proj-1', 'asg-1', 1, ['sn-pub']);

    // currentCount was seen as 0, not 1 — so it created one, never touched the foreign instance.
    expect(createContainer).toHaveBeenCalledTimes(1);
    expect(deleteContainer).not.toHaveBeenCalled();
  });

  it('scales down newest-first and removes those keys from the config', async () => {
    getNetworkConfig.mockResolvedValue({ subnets: [{ id: 'sn-pub', type: 'public' }] });
    listContainers.mockResolvedValue([
      instance('rep-old', 'proj-1', 'asg-1', 100),
      instance('rep-new', 'proj-1', 'asg-1', 300),
      instance('rep-mid', 'proj-1', 'asg-1', 200)
    ]);
    runUpdaterAgainst({
      nodeSubnetMap: { 'rep-old': 'sn-pub', 'rep-new': 'sn-pub', 'rep-mid': 'sn-pub' },
      asgReplicaNodes: ['rep-old', 'rep-new', 'rep-mid']
    });

    await AsgService.scaleASG('proj-1', 'asg-1', 1, ['sn-pub']);

    // Two newest terminated, oldest kept.
    expect(deleteContainer).toHaveBeenCalledWith('rep-new');
    expect(deleteContainer).toHaveBeenCalledWith('rep-mid');
    expect(deleteContainer).not.toHaveBeenCalledWith('rep-old');

    const applied = applyPolicy.mock.calls[0][1];
    expect(applied.nodeSubnetMap).toEqual({ 'rep-old': 'sn-pub' });
    expect(applied.asgReplicaNodes).toEqual(['rep-old']);
  });

  it('never writes the pre-Docker snapshot back to the store', async () => {
    getNetworkConfig.mockResolvedValue({ subnets: [{ id: 'sn-pub', type: 'public' }] });
    listContainers.mockResolvedValue([]);
    createContainer.mockResolvedValueOnce({ id: 'replica-1' });
    runUpdaterAgainst({ nodeSubnetMap: {}, asgReplicaNodes: [] });

    await AsgService.scaleASG('proj-1', 'asg-1', 1, ['sn-pub']);

    // The mapping is applied through the functional updater, not a whole-config save.
    expect(updateNetworkConfig).toHaveBeenCalledTimes(1);
    expect((ProjectService as unknown as { saveNetworkConfig?: unknown }).saveNetworkConfig).toBeUndefined();
  });
});

describe('AsgService.terminateInstance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // terminateInstance schedules a self-healing check on a real timer; fake
    // timers keep it from firing (and leaking) after the test completes.
    jest.useFakeTimers();
    (containerProvider.listContainersByProject as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('fail-injects only after confirming the instance belongs to the project', async () => {
    assertContainerInProject.mockResolvedValue(undefined);

    await AsgService.terminateInstance('proj-1', 'replica-1');

    expect(assertContainerInProject).toHaveBeenCalledWith('replica-1', 'proj-1');
    expect(markAsCrashed).toHaveBeenCalledWith('replica-1');
  });

  it('refuses to touch an instance from another project', async () => {
    assertContainerInProject.mockRejectedValue(new Error('CONTAINER_NOT_FOUND'));

    await expect(AsgService.terminateInstance('proj-1', 'foreign')).rejects.toThrow('CONTAINER_NOT_FOUND');
    expect(markAsCrashed).not.toHaveBeenCalled();
  });
});
