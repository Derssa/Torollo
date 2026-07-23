import { Router } from 'express';
import { LearningController } from '../controllers/learningController';

const router = Router();

router.get('/roadmaps', LearningController.listRoadmaps);
router.get('/roadmaps/:id', LearningController.getRoadmap);
router.post('/validate', LearningController.validate);
router.get('/progress', LearningController.listProgress);
router.get('/progress/:projectId/:roadmapId', LearningController.getProgress);
router.put('/progress/:projectId/:roadmapId/hints', LearningController.recordRevealedHints);
router.delete('/progress/:projectId/:roadmapId', LearningController.resetProgress);

export default router;
