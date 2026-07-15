import { Request, Response } from 'express';
import { RoadmapService } from '../services/roadmapService';
import { runStepValidators } from '../engine/engine';
import { ValidatorResult } from '../engine/types';
import { ProjectService } from '../../projects/services/projectService';

/** Contract of POST /api/learning/validate — documented in docs/learning-api.md. */
export interface StepValidationResponse {
  roadmapId: string;
  stepId: string;
  /** true iff every result is 'pass' — an 'error' never validates a step. */
  stepPassed: boolean;
  results: ValidatorResult[];
  checkedAt: string;
}

export class LearningController {
  public static async listRoadmaps(req: Request, res: Response): Promise<void> {
    try {
      res.json(RoadmapService.listRoadmaps());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  public static async getRoadmap(req: Request, res: Response): Promise<void> {
    try {
      const { language } = req.query;
      const wantedLanguage =
        typeof language === 'string' && language.length > 0 ? language : undefined;
      const roadmap = RoadmapService.getRoadmap(
        req.params.id as string,
        wantedLanguage ? { language: wantedLanguage } : {}
      );
      if (!roadmap) {
        res.status(404).json({
          error: wantedLanguage
            ? `No roadmap found with id "${req.params.id}" in language "${wantedLanguage}".`
            : `No roadmap found with id "${req.params.id}".`,
          code: 'ROADMAP_NOT_FOUND',
        });
        return;
      }
      res.json(roadmap);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  public static async validate(req: Request, res: Response): Promise<void> {
    try {
      // req.body is undefined when the request has no JSON Content-Type —
      // fall through to the per-field 400s instead of throwing a 500.
      const { projectId, roadmapId, stepId } = (req.body ?? {}) as Record<string, unknown>;
      for (const [name, value] of Object.entries({ projectId, roadmapId, stepId })) {
        if (typeof value !== 'string' || value.length === 0) {
          res.status(400).json({ error: `"${name}" is required and must be a string` });
          return;
        }
      }

      // Guard against a stale projectId: without it, an empty container list
      // would produce plausible-looking pedagogical failures on a wrong target.
      const projects = await ProjectService.listProjects();
      if (!projects.some(p => p.id === projectId)) {
        res.status(404).json({
          error: `No project found with id "${projectId}".`,
          code: 'PROJECT_NOT_FOUND',
        });
        return;
      }

      const roadmap = RoadmapService.getRoadmap(roadmapId as string);
      if (!roadmap) {
        res.status(404).json({
          error: `No roadmap found with id "${roadmapId}".`,
          code: 'ROADMAP_NOT_FOUND',
        });
        return;
      }

      const step = roadmap.steps.find(s => s.id === stepId);
      if (!step) {
        res.status(404).json({
          error: `Roadmap "${roadmapId}" has no step with id "${stepId}".`,
          code: 'STEP_NOT_FOUND',
        });
        return;
      }

      const results = await runStepValidators(projectId as string, step);
      const response: StepValidationResponse = {
        roadmapId: roadmap.id,
        stepId: step.id,
        stepPassed: results.every(r => r.status === 'pass'),
        results,
        checkedAt: new Date().toISOString(),
      };
      res.json(response);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}
