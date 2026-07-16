import request from 'supertest';
import express from 'express';
import learningRouter from '../routes/learningRoutes';
import { RoadmapService } from '../services/roadmapService';
import { ProgressService } from '../services/progressService';
import { runStepValidators } from '../engine/engine';
import { ValidatorResult } from '../engine/types';
import { ProjectService } from '../../projects/services/projectService';
import { Roadmap } from '../format/roadmapTypes';

jest.mock('../services/roadmapService');
jest.mock('../services/progressService');
jest.mock('../engine/engine');
jest.mock('../../projects/services/projectService');

const app = express();
app.use(express.json());
app.use('/api/learning', learningRouter);

const roadmap: Roadmap = {
  schemaVersion: 1,
  id: 'example-roadmap',
  title: 'Example roadmap',
  description: 'For controller tests.',
  language: 'en',
  steps: [
    {
      id: 'step-one',
      title: 'Step one',
      instruction: 'Do it.',
      validators: [{ type: 'container_running', params: { node: 'web' } }],
    },
  ],
};

const passResult: ValidatorResult = {
  index: 0,
  type: 'container_running',
  status: 'pass',
  message: 'The container "web" is running.',
};

const failResult: ValidatorResult = {
  index: 0,
  type: 'container_running',
  status: 'fail',
  message: 'No container named "web" exists in this project yet.',
  expected: 'a running container named "web"',
  observed: 'no container with that name',
};

const validBody = { projectId: 'project-1', roadmapId: 'example-roadmap', stepId: 'step-one' };

describe('LearningController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ProjectService.listProjects as jest.Mock).mockResolvedValue([{ id: 'project-1' }]);
    (RoadmapService.getRoadmap as jest.Mock).mockReturnValue(roadmap);
    (runStepValidators as jest.Mock).mockResolvedValue([passResult]);
  });

  describe('GET /api/learning/roadmaps', () => {
    it('returns the roadmap summaries', async () => {
      const summaries = [{ id: 'example-roadmap', title: 'Example roadmap', stepCount: 1 }];
      (RoadmapService.listRoadmaps as jest.Mock).mockReturnValue(summaries);

      const res = await request(app).get('/api/learning/roadmaps');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(summaries);
    });
  });

  describe('GET /api/learning/roadmaps/:id', () => {
    it('returns the full roadmap for a known id', async () => {
      const res = await request(app).get('/api/learning/roadmaps/example-roadmap');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(roadmap);
      expect(RoadmapService.getRoadmap).toHaveBeenCalledWith('example-roadmap', {});
    });

    it('forwards the language query to the service', async () => {
      const res = await request(app).get('/api/learning/roadmaps/example-roadmap?language=fr');

      expect(res.status).toBe(200);
      expect(RoadmapService.getRoadmap).toHaveBeenCalledWith('example-roadmap', {
        language: 'fr',
      });
    });

    it('returns 404 for an unknown id', async () => {
      (RoadmapService.getRoadmap as jest.Mock).mockReturnValue(null);

      const res = await request(app).get('/api/learning/roadmaps/nope');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ROADMAP_NOT_FOUND');
    });
  });

  describe('POST /api/learning/validate', () => {
    it('runs the step validators and returns the structured response', async () => {
      const res = await request(app).post('/api/learning/validate').send(validBody);

      expect(res.status).toBe(200);
      expect(runStepValidators).toHaveBeenCalledWith('project-1', roadmap.steps[0]);
      expect(res.body).toEqual({
        roadmapId: 'example-roadmap',
        stepId: 'step-one',
        stepPassed: true,
        results: [passResult],
        checkedAt: expect.any(String),
      });
    });

    it('marks the step as not passed when a validator fails', async () => {
      (runStepValidators as jest.Mock).mockResolvedValue([failResult]);

      const res = await request(app).post('/api/learning/validate').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.stepPassed).toBe(false);
      expect(res.body.results).toEqual([failResult]);
    });

    it.each(['projectId', 'roadmapId', 'stepId'])(
      'returns 400 when "%s" is missing',
      async (field) => {
        const body: Record<string, string> = { ...validBody };
        delete body[field];

        const res = await request(app).post('/api/learning/validate').send(body);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain(`"${field}"`);
      }
    );

    it('returns 400 (not 500) when the request has no JSON body', async () => {
      const res = await request(app)
        .post('/api/learning/validate')
        .set('Content-Type', 'text/plain')
        .send('not json');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('"projectId"');
    });

    it('returns 404 when the project does not exist', async () => {
      (ProjectService.listProjects as jest.Mock).mockResolvedValue([]);

      const res = await request(app).post('/api/learning/validate').send(validBody);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PROJECT_NOT_FOUND');
    });

    it('returns 404 when the roadmap does not exist', async () => {
      (RoadmapService.getRoadmap as jest.Mock).mockReturnValue(null);

      const res = await request(app).post('/api/learning/validate').send(validBody);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ROADMAP_NOT_FOUND');
    });

    it('returns 404 when the step does not exist in the roadmap', async () => {
      const res = await request(app)
        .post('/api/learning/validate')
        .send({ ...validBody, stepId: 'nope' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('STEP_NOT_FOUND');
    });

    it('returns 500 when the engine throws unexpectedly', async () => {
      (runStepValidators as jest.Mock).mockRejectedValue(new Error('boom'));

      const res = await request(app).post('/api/learning/validate').send(validBody);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'boom' });
    });

    it('records the attempt and verdict in the progress store', async () => {
      const res = await request(app).post('/api/learning/validate').send(validBody);

      expect(res.status).toBe(200);
      expect(ProgressService.recordValidation).toHaveBeenCalledWith(
        'project-1',
        'example-roadmap',
        'step-one',
        true,
        res.body.checkedAt
      );
    });

    it('still returns the verdict when progress recording fails', async () => {
      (ProgressService.recordValidation as jest.Mock).mockImplementation(() => {
        throw new Error('disk full');
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app).post('/api/learning/validate').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.stepPassed).toBe(true);
      errorSpy.mockRestore();
    });
  });

  describe('GET /api/learning/progress/:projectId/:roadmapId', () => {
    it('returns the stored progress for the pair', async () => {
      const progress = {
        projectId: 'project-1',
        roadmapId: 'example-roadmap',
        steps: { 'step-one': { passed: true, attempts: 2, revealedHints: 1 } },
      };
      (ProgressService.getProgress as jest.Mock).mockReturnValue(progress);

      const res = await request(app).get('/api/learning/progress/project-1/example-roadmap');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(progress);
      expect(ProgressService.getProgress).toHaveBeenCalledWith('project-1', 'example-roadmap');
    });
  });

  describe('PUT /api/learning/progress/:projectId/:roadmapId/hints', () => {
    it('stores the absolute revealed-hints count and returns 204', async () => {
      const res = await request(app)
        .put('/api/learning/progress/project-1/example-roadmap/hints')
        .send({ stepId: 'step-one', revealedHints: 2 });

      expect(res.status).toBe(204);
      expect(ProgressService.recordRevealedHints).toHaveBeenCalledWith(
        'project-1',
        'example-roadmap',
        'step-one',
        2
      );
    });

    it.each([
      ['missing stepId', { revealedHints: 1 }, 'stepId'],
      ['empty stepId', { stepId: '', revealedHints: 1 }, 'stepId'],
      ['missing revealedHints', { stepId: 'step-one' }, 'revealedHints'],
      ['negative revealedHints', { stepId: 'step-one', revealedHints: -1 }, 'revealedHints'],
      ['non-integer revealedHints', { stepId: 'step-one', revealedHints: 1.5 }, 'revealedHints'],
    ])('returns 400 on %s', async (_name, body, field) => {
      const res = await request(app)
        .put('/api/learning/progress/project-1/example-roadmap/hints')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(`"${field}"`);
      expect(ProgressService.recordRevealedHints).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/learning/progress/:projectId/:roadmapId', () => {
    it('resets the pair and returns 204', async () => {
      const res = await request(app).delete('/api/learning/progress/project-1/example-roadmap');

      expect(res.status).toBe(204);
      expect(ProgressService.resetProgress).toHaveBeenCalledWith('project-1', 'example-roadmap');
    });
  });
});
