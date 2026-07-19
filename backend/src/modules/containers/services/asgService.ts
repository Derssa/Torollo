import { containerProvider } from '../../../infrastructure/docker/providers/dockerContainerProvider';
import { ProjectService } from '../../projects/services/projectService';
import { NetworkService } from '../../network/services/networkService';
import docker from '../../../infrastructure/docker/DockerClient';

export class AsgService {
  private static getAsgImageName(projectId: string, asgId: string): string {
    return `akal-lab-project-${projectId}-asg-${asgId}-image`.toLowerCase();
  }

  public static async deployASG(
    projectId: string,
    asgId: string,
    parentNodeId: string,
    desiredCapacity: number,
    subnetIds: string[]
  ): Promise<any[]> {
    console.log(`[AsgService] Deploying ASG ${asgId} for project ${projectId} using parent node ${parentNodeId}`);

    const config = await ProjectService.getNetworkConfig(projectId);
    if (!config) {
      throw new Error(`Project configuration not found`);
    }

    // 1. Get parent container details
    const containers = await containerProvider.listContainersByProject(projectId);
    const parentContainer = containers.find(c => c.id === parentNodeId || c.id.startsWith(parentNodeId));
    if (!parentContainer) {
      throw new Error(`Parent template server container not found`);
    }

    // 2. Commit parent container state to custom image
    const imageName = this.getAsgImageName(projectId, asgId);
    await containerProvider.commitContainer(parentContainer.id, imageName, 'latest');

    // 3. Perform rolling update/sync to match desired capacity using the new image
    return this.scaleASG(projectId, asgId, desiredCapacity, subnetIds);
  }

  public static async scaleASG(
    projectId: string,
    asgId: string,
    desiredCapacity: number,
    subnetIds: string[]
  ): Promise<any[]> {
    console.log(`[AsgService] Scaling ASG ${asgId} to desired capacity of ${desiredCapacity}`);

    const config = await ProjectService.getNetworkConfig(projectId);
    if (!config) {
      throw new Error(`Project configuration not found`);
    }

    const imageName = this.getAsgImageName(projectId, asgId);

    // List this project's replicas only — a scale must never see or touch
    // another project's fleet, even if two projects reuse an ASG id.
    const allContainers = await docker.listContainers({ all: true });
    const asgInstances = allContainers.filter(
      c => c.Labels
        && c.Labels['akal.project.id'] === projectId
        && c.Labels['akal.asg.id'] === asgId
        && c.Labels['akal.asg.instance'] === 'true'
    );

    const currentCount = asgInstances.length;
    console.log(`[AsgService] ASG ${asgId} currently has ${currentCount} instances. Target: ${desiredCapacity}`);

    // Do all the (slow) Docker work first and record only the delta — the
    // set of replica→subnet mappings to add and the container ids to remove.
    // The persisted config is then updated by key, so this scale can't clobber
    // a topology save that lands while the containers are booting.
    const added: Record<string, string> = {};
    const removed: string[] = [];

    if (currentCount < desiredCapacity) {
      // Scale UP: create new instances
      const needed = desiredCapacity - currentCount;
      for (let i = 0; i < needed; i++) {
        const randId = Math.random().toString(36).substring(2, 6);
        const name = `asg-${asgId}-instance-${randId}`;

        // Select a subnet in round-robin fashion from target subnets
        const targetSubnetId = subnetIds[i % subnetIds.length];
        const subnet = config.subnets?.find((s: any) => s.id === targetSubnetId);
        const isPublic = subnet?.type === 'public';

        console.log(`[AsgService] Spawning instance ${name} in subnet ${targetSubnetId} (Public: ${isPublic})`);

        // Create container using custom image
        const instance = await containerProvider.createContainer(
          projectId,
          name,
          'ubuntu',
          isPublic,
          `${imageName}:latest`,
          {
            'akal.asg.id': asgId,
            'akal.asg.instance': 'true'
          }
        );

        added[instance.id] = targetSubnetId;
      }
    } else if (currentCount > desiredCapacity) {
      // Scale DOWN: terminate excess instances
      const excess = currentCount - desiredCapacity;
      const sortedInstances = [...asgInstances].sort((a, b) => b.Created - a.Created); // Remove newest first
      for (let i = 0; i < excess; i++) {
        const cId = sortedInstances[i].Id;
        console.log(`[AsgService] Scaling down: deleting excess instance ${cId.slice(0, 12)}`);
        try {
          await containerProvider.deleteContainer(cId);
        } catch (err) {
          console.error(`Failed to delete container ${cId}:`, err);
        }
        removed.push(cId);
      }
    }

    // Apply the replica delta by key into the *current* on-disk config, keeping
    // the `asgReplicaNodes` manifest in sync so a later frontend save preserves
    // these mappings. Falls back to the pre-scale snapshot only if the project
    // vanished mid-scale.
    const mergedConfig = await ProjectService.updateNetworkConfig(projectId, current => {
      const nodeSubnetMap: Record<string, string> = { ...(current.nodeSubnetMap ?? {}) };
      const replicaNodes = new Set<string>(current.asgReplicaNodes ?? []);

      for (const [id, subnetId] of Object.entries(added)) {
        nodeSubnetMap[id] = subnetId;
        replicaNodes.add(id);
      }
      for (const cId of removed) {
        delete nodeSubnetMap[cId];
        delete nodeSubnetMap[cId.slice(0, 12)]; // Clean up short ID mapping too
        replicaNodes.delete(cId);
        replicaNodes.delete(cId.slice(0, 12));
      }

      return { ...current, nodeSubnetMap, asgReplicaNodes: [...replicaNodes] };
    });

    // Trigger policy re-application with the merged config, never the snapshot
    // read before the Docker work.
    const effectiveConfig = mergedConfig ?? config;
    NetworkService.clearPolicyHash(projectId);
    await NetworkService.applyPolicy(projectId, effectiveConfig);

    // Return the updated list of containers belonging to this project
    return containerProvider.listContainersByProject(projectId);
  }

  public static async terminateInstance(projectId: string, instanceId: string): Promise<any[]> {
    console.log(`[AsgService] Simulating failure (Fake crash): ${instanceId}`);
    // Only the owning project may fail-inject one of its own instances.
    await containerProvider.assertContainerInProject(instanceId, projectId);
    containerProvider.markAsCrashed(instanceId);

    // Run health check self-healing check asynchronously to simulate recovery delay
    setTimeout(async () => {
      try {
        await this.runSelfHealing(projectId);
      } catch (err) {
        console.error(`Self-healing routine error:`, err);
      }
    }, 1500);

    return containerProvider.listContainersByProject(projectId);
  }

  public static async runSelfHealing(projectId: string): Promise<void> {
    console.log(`[AsgService] Running self-healing monitor check (Fake healing) for project: ${projectId}`);
    
    // Clear fake crashed states to heal the containers
    containerProvider.clearAllCrashed();

    // Re-apply the current policy without rewriting the store: healing changes
    // no mapping, and a whole-config re-save here would only be another chance
    // to clobber a concurrent topology save.
    const config = await ProjectService.getNetworkConfig(projectId);
    if (config) {
      NetworkService.clearPolicyHash(projectId);
      await NetworkService.applyPolicy(projectId, config);
    }
  }
}
