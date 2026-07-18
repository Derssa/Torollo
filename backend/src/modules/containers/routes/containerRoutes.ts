import { Router } from 'express';
import { ContainerController } from '../controllers/containerController';
import { AsgController } from '../controllers/asgController';
import { requireContainerOwnership } from '../middleware/containerOwnership';

const router = Router({ mergeParams: true });

router.get('/', ContainerController.list);
router.post('/', ContainerController.create);
router.post('/:id/start', requireContainerOwnership, ContainerController.start);
router.post('/:id/stop', requireContainerOwnership, ContainerController.stop);
router.delete('/:id', requireContainerOwnership, ContainerController.delete);
router.patch('/:id/rename', requireContainerOwnership, ContainerController.rename);
router.get('/:id/postgres/explorer', requireContainerOwnership, ContainerController.postgresExplorer);
router.post('/:id/postgres/query', requireContainerOwnership, ContainerController.postgresQuery);
router.get('/:id/nosql/explorer', requireContainerOwnership, ContainerController.nosqlExplorer);
router.post('/:id/nosql/query', requireContainerOwnership, ContainerController.nosqlQuery);
router.get('/:id/redis/explorer', requireContainerOwnership, ContainerController.redisExplorer);
router.post('/:id/redis/query', requireContainerOwnership, ContainerController.redisQuery);
router.post('/:id/scale', requireContainerOwnership, ContainerController.scale);

// ASG Routes
router.post('/asg/:asgId/deploy', AsgController.deploy);
router.post('/asg/:asgId/scale', AsgController.scale);
router.post('/asg/terminate', AsgController.terminate);

export default router;
