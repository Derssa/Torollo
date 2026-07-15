import { NodeType } from '../nodeTypes';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  type?: NodeType;
  port?: string;
  ip?: string;
  asgId?: string;
  isAsgInstance?: boolean;
}

export interface ContainerProvider {
  listContainersByProject(projectId: string): Promise<ContainerInfo[]>;
  createContainer(
    projectId: string,
    nodeName: string,
    type?: string,
    isPublic?: boolean,
    customImage?: string,
    extraLabels?: Record<string, string>
  ): Promise<ContainerInfo>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string): Promise<void>;
  deleteContainer(id: string): Promise<void>;
  renameContainer(containerId: string, projectId: string, newName: string): Promise<void>;
  commitContainer(id: string, repoName: string, tag?: string): Promise<string>;
  scaleContainer(id: string, cpus?: number, memory?: number): Promise<void>;
  executePsqlCommand(containerId: string, database: string, sqlQuery: string, extraArgs?: string[]): Promise<string>;
  executeRedisCommand(containerId: string, args: string[]): Promise<string>;
  executeMongoCommand(containerId: string, evalExpression: string): Promise<string>;
  executeCustomCommand(containerId: string, cmd: string[]): Promise<string>;
  markAsCrashed(instanceId: string): void;
  clearCrashed(instanceId: string): void;
  clearAllCrashed(): void;
  isCrashed(instanceId: string): boolean;
}
