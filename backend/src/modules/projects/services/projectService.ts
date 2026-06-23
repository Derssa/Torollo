import fs from 'fs';
import path from 'path';
import os from 'os';
import { ContainerManager } from '../../../infrastructure/docker/ContainerManager';
import { NetworkService } from '../../network/services/networkService';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  networkConfig?: any;
}

const TOROLLO_DIR = path.join(os.homedir(), '.torollo');
const DB_PATH = path.join(TOROLLO_DIR, 'projects.json');

export class ProjectService {
  private static readDB(): Project[] {
    if (!fs.existsSync(TOROLLO_DIR)) {
      fs.mkdirSync(TOROLLO_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify([]));
    }
    try {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private static writeDB(data: Project[]): void {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  }

  public static async listProjects(): Promise<Project[]> {
    return this.readDB();
  }

  public static async createProject(name: string): Promise<Project> {
    const db = this.readDB();
    const newProject: Project = {
      id: `project-${Date.now()}`,
      name,
      createdAt: new Date().toISOString()
    };
    db.push(newProject);
    this.writeDB(db);
    return newProject;
  }

  public static async deleteProject(id: string): Promise<void> {
    const db = this.readDB();
    const project = db.find(p => p.id === id);
    if (project && project.networkConfig) {
      try {
        await NetworkService.cleanupProjectNetwork(id, project.networkConfig);
      } catch (err) {
        console.error(`Failed to cleanup network policies during project cleanup:`, err);
      }
    }

    const filtered = db.filter(p => p.id !== id);
    this.writeDB(filtered);

    // Stop and delete all containers belonging to this project
    const containers = await ContainerManager.listContainersByProject(id);
    for (const c of containers) {
      try {
        await ContainerManager.deleteContainer(c.id);
      } catch (err) {
        console.error(`Failed to delete container ${c.id} during project cleanup:`, err);
      }
    }
  }

  public static async getNetworkConfig(projectId: string): Promise<any> {
    const db = this.readDB();
    const project = db.find(p => p.id === projectId);
    return project?.networkConfig || null;
  }

  public static async saveNetworkConfig(projectId: string, networkConfig: any): Promise<void> {
    const db = this.readDB();
    const project = db.find(p => p.id === projectId);
    if (project) {
      project.networkConfig = networkConfig;
      this.writeDB(db);
    }
  }
}
