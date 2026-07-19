import { Request, Response } from 'express';
import { AsgService } from '../services/asgService';
import { sendDockerError } from '../../../infrastructure/docker/dockerErrors';
import { validateDesiredCapacity } from '../validation/asgCapacity';

export class AsgController {
  public static async deploy(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params.projectId as string;
      const asgId = req.params.asgId as string;
      const { parentNodeId, desiredCapacity, subnetIds } = req.body;

      if (!parentNodeId) {
        res.status(400).json({ error: 'parentNodeId is required to deploy ASG' });
        return;
      }
      if (!subnetIds || subnetIds.length === 0) {
        res.status(400).json({ error: 'At least one target subnetId is required' });
        return;
      }
      const capacityViolation = validateDesiredCapacity(desiredCapacity, 1);
      if (capacityViolation) {
        res.status(400).json({ error: capacityViolation.message, code: capacityViolation.code });
        return;
      }

      const containers = await AsgService.deployASG(
        projectId,
        asgId,
        parentNodeId,
        desiredCapacity || 1,
        subnetIds
      );
      res.json(containers);
    } catch (err: any) {
      sendDockerError(res, err, 'deploying the auto-scaling group');
    }
  }

  public static async scale(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params.projectId as string;
      const asgId = req.params.asgId as string;
      const { desiredCapacity, subnetIds } = req.body;

      if (!subnetIds || subnetIds.length === 0) {
        res.status(400).json({ error: 'At least one target subnetId is required' });
        return;
      }
      const capacityViolation = validateDesiredCapacity(desiredCapacity, 0);
      if (capacityViolation) {
        res.status(400).json({ error: capacityViolation.message, code: capacityViolation.code });
        return;
      }

      const containers = await AsgService.scaleASG(
        projectId,
        asgId,
        desiredCapacity !== undefined ? desiredCapacity : 1,
        subnetIds
      );
      res.json(containers);
    } catch (err: any) {
      sendDockerError(res, err, 'scaling the auto-scaling group');
    }
  }

  public static async terminate(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params.projectId as string;
      const { instanceId } = req.body;

      if (!instanceId) {
        res.status(400).json({ error: 'instanceId is required to simulate failure' });
        return;
      }

      const containers = await AsgService.terminateInstance(projectId, instanceId);
      res.json(containers);
    } catch (err: any) {
      sendDockerError(res, err, 'terminating the instance');
    }
  }
}
