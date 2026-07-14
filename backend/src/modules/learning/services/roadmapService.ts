import fs from 'fs';
import path from 'path';
import { Roadmap, RoadmapDifficulty } from '../format/roadmapTypes';
import { validateRoadmap } from '../format/validateRoadmap';

/** What the roadmap catalogue exposes to the frontend (GET /api/learning/roadmaps). */
export interface RoadmapSummary {
  id: string;
  title: string;
  description: string;
  language: string;
  difficulty?: RoadmapDifficulty;
  estimatedMinutes?: number;
  stepCount: number;
}

// Resolved from this file, never from process.cwd(): the CLI spawns the server
// without a cwd, and dist/ mirrors src/ so the same hops work in dev and prod.
// services/ → learning → modules → src|dist → backend → repo root.
const ROADMAPS_DIR = path.resolve(__dirname, '../../../../../roadmaps');

/**
 * Loads roadmap files (format v1) from the roadmaps/ directory.
 *
 * Files are re-read on every call — they are a few kB, requested at human
 * frequency, and this gives roadmap authors hot reload for free. A file that
 * is not valid JSON or does not pass the format schema is logged and skipped,
 * never served. The optional `dir` parameter exists for tests only.
 */
export class RoadmapService {
  public static listRoadmaps(dir: string = ROADMAPS_DIR): RoadmapSummary[] {
    return this.readAll(dir).map(roadmap => ({
      id: roadmap.id,
      title: roadmap.title,
      description: roadmap.description,
      language: roadmap.language,
      difficulty: roadmap.difficulty,
      estimatedMinutes: roadmap.estimatedMinutes,
      stepCount: roadmap.steps.length,
    }));
  }

  public static getRoadmap(id: string, dir: string = ROADMAPS_DIR): Roadmap | null {
    return this.readAll(dir).find(roadmap => roadmap.id === id) ?? null;
  }

  private static readAll(dir: string): Roadmap[] {
    if (!fs.existsSync(dir)) {
      console.warn(`[learning] Roadmaps directory not found: ${dir}`);
      return [];
    }

    const roadmaps: Roadmap[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) {
        continue;
      }
      try {
        const data: unknown = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        const result = validateRoadmap(data);
        if (!result.valid) {
          console.warn(`[learning] Skipping invalid roadmap file ${file}: ${result.errors.join('; ')}`);
          continue;
        }
        roadmaps.push(result.roadmap);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[learning] Skipping invalid roadmap file ${file}: ${reason}`);
      }
    }
    return roadmaps;
  }
}
