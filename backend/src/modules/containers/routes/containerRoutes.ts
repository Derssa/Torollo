import { Router } from 'express';
import { ContainerController } from '../controllers/containerController';

const router = Router({ mergeParams: true });

router.get('/', ContainerController.list);
router.post('/', ContainerController.create);
router.post('/:id/start', ContainerController.start);
router.post('/:id/stop', ContainerController.stop);
router.delete('/:id', ContainerController.delete);
router.get('/:id/postgres/explorer', ContainerController.postgresExplorer);
router.post('/:id/postgres/query', ContainerController.postgresQuery);

export default router;
