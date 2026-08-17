import express, { Router } from 'express';
import { LearningController } from '../controllers/learningController';

const router = Router();

router.get('/roadmaps', LearningController.listRoadmaps);
// Raw body, whatever the Content-Type: the upload is a .json file or a .zip
// archive and the service decides from the bytes. Registered before
// /roadmaps/:id so "import" is never read as a roadmap id.
router.post(
  '/roadmaps/import',
  express.raw({ type: () => true, limit: '25mb' }),
  LearningController.importRoadmaps
);
router.get('/roadmaps/:id', LearningController.getRoadmap);
router.post('/validate', LearningController.validate);
router.get('/progress', LearningController.listProgress);
router.get('/progress/:projectId/:roadmapId', LearningController.getProgress);
router.put('/progress/:projectId/:roadmapId/hints', LearningController.recordRevealedHints);
router.delete('/progress/:projectId/:roadmapId', LearningController.resetProgress);

export default router;
