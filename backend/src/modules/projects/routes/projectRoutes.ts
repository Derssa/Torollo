import { Router } from 'express';
import { ProjectController } from '../controllers/projectController';

const router = Router();

router.get('/', ProjectController.list);
router.post('/', ProjectController.create);
router.delete('/:id', ProjectController.delete);
router.get('/:id/network-config', ProjectController.getNetworkConfig);
router.post('/:id/network-config', ProjectController.saveNetworkConfig);
router.get('/:id/network-health', ProjectController.getNetworkHealth);

export default router;
