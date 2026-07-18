import { Request, Response, NextFunction } from 'express';
import { ContainerService } from '../services/containerService';
import { sendDockerError } from '../../../infrastructure/docker/dockerErrors';

/**
 * Guards every /:id container route: the container must carry the label
 * `akal.project.id` matching the projectId in the URL, otherwise the request
 * is answered 404 — indistinguishable from a missing container.
 */
export async function requireContainerOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ContainerService.assertContainerInProject(req.params.id as string, req.params.projectId as string);
    next();
  } catch (err) {
    sendDockerError(res, err, 'accessing the container');
  }
}
