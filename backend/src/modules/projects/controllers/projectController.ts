import { Request, Response } from 'express';
import { ProjectService } from '../services/projectService';
import { NetworkService } from '../../network/services/networkService';

export class ProjectController {
  public static async list(req: Request, res: Response): Promise<void> {
    try {
      const list = await ProjectService.listProjects();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Project name is required' });
        return;
      }
      
      const db = await ProjectService.listProjects();
      const nameExists = db.some(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (nameExists) {
        res.status(409).json({ error: `A project named "${name}" already exists.` });
        return;
      }

      const project = await ProjectService.createProject(name);
      res.status(201).json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    try {
      await ProjectService.deleteProject(req.params.id as string);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getNetworkConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = await ProjectService.getNetworkConfig(req.params.id as string);
      res.json(config || {});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async saveNetworkConfig(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const { networkConfig } = req.body;
      if (!networkConfig) {
        res.status(400).json({ error: 'networkConfig is required' });
        return;
      }
      await ProjectService.saveNetworkConfig(projectId, networkConfig);
      
      // Enforce the logic synchronously so any shifted CIDRs are computed and saved
      await NetworkService.applyPolicy(projectId, networkConfig);

      // Fetch and return the updated config containing shifted CIDRs and IPs
      const updatedConfig = await ProjectService.getNetworkConfig(projectId);
      res.json(updatedConfig || { success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
