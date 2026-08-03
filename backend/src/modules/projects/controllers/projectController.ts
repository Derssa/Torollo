import { Request, Response } from 'express';
import { ProjectService } from '../services/projectService';
import { NetworkService } from '../../network/services/networkService';
import { getInterSubnetStatus } from '../../network/services/interSubnetHealth';
import { validateAsgCapacityConfig } from '../../containers/validation/asgCapacity';

export class ProjectController {
  public static async list(req: Request, res: Response): Promise<void> {
    try {
      const list = await ProjectService.listProjects();
      // storeRecovered is one-shot: present (true) once after an unreadable
      // store was moved aside, so the UI can tell the user.
      res.json({
        projects: list,
        ...(ProjectService.consumeStoreRecovered() ? { storeRecovered: true } : {})
      });
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

  /**
   * Runtime health of the project's virtual network on this host. Currently
   * one signal: the inter-subnet connectivity self-test verdict (`ok` /
   * `blocked` / `unknown`), so the UI can warn when the host drops routed
   * traffic between subnets.
   */
  public static getNetworkHealth(req: Request, res: Response): void {
    res.json({ interSubnet: getInterSubnetStatus(req.params.id as string) });
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
      for (const [asgId, entry] of Object.entries(networkConfig.asgs ?? {})) {
        const capacityViolation = validateAsgCapacityConfig(asgId, entry);
        if (capacityViolation) {
          res.status(400).json({ error: capacityViolation.message, code: capacityViolation.code });
          return;
        }
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
