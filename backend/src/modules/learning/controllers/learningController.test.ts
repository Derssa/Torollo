import request from 'supertest';
import express from 'express';
import learningRouter from '../routes/learningRoutes';
import { RoadmapService } from '../services/roadmapService';
import { runStepValidators } from '../engine/engine';
import { ValidatorResult } from '../engine/types';
import { ProjectService } from '../../projects/services/projectService';
import { Roadmap } from '../format/roadmapTypes';

jest.mock('../services/roadmapService');
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
      expect(RoadmapService.getRoadmap).toHaveBeenCalledWith('example-roadmap');
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
  });
});
