import { Router } from 'express';
import { LearningController } from '../controllers/learningController';

const router = Router();

router.get('/roadmaps', LearningController.listRoadmaps);
router.get('/roadmaps/:id', LearningController.getRoadmap);
router.post('/validate', LearningController.validate);

export default router;
