import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProgressService } from './progressService';

describe('ProgressService', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torollo-progress-'));
    file = path.join(dir, 'progress.json');
    (ProgressService as unknown as { storeRecovered: boolean }).storeRecovered = false;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty steps when nothing was ever recorded', () => {
    const progress = ProgressService.getProgress('project-1', 'roadmap-1', file);

    expect(progress).toEqual({ projectId: 'project-1', roadmapId: 'roadmap-1', steps: {} });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('counts attempts and keeps the latest verdict across validations', () => {
    ProgressService.recordValidation('project-1', 'roadmap-1', 'step-a', true, '2026-07-16T10:00:00.000Z', file);
    ProgressService.recordValidation('project-1', 'roadmap-1', 'step-a', false, '2026-07-16T10:05:00.000Z', file);

    const progress = ProgressService.getProgress('project-1', 'roadmap-1', file);

    expect(progress.steps['step-a']).toEqual({
      passed: false,
      attempts: 2,
      revealedHints: 0,
      lastCheckedAt: '2026-07-16T10:05:00.000Z',
    });
  });

  it('persists across service calls via the file (survives a fresh read)', () => {
    ProgressService.recordValidation('project-1', 'roadmap-1', 'step-a', true, '2026-07-16T10:00:00.000Z', file);
    ProgressService.recordRevealedHints('project-1', 'roadmap-1', 'step-b', 2, file);

    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));

    expect(stored.version).toBe(1);
    expect(stored.entries).toHaveLength(1);
    expect(stored.entries[0].projectId).toBe('project-1');
    expect(stored.entries[0].roadmapId).toBe('roadmap-1');
    expect(stored.entries[0].steps['step-a'].passed).toBe(true);
    expect(stored.entries[0].steps['step-b'].revealedHints).toBe(2);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('stores revealed hints as an absolute count', () => {
    ProgressService.recordRevealedHints('project-1', 'roadmap-1', 'step-a', 1, file);
    ProgressService.recordRevealedHints('project-1', 'roadmap-1', 'step-a', 3, file);

    const progress = ProgressService.getProgress('project-1', 'roadmap-1', file);

    expect(progress.steps['step-a']).toEqual({ passed: false, attempts: 0, revealedHints: 3 });
  });

  it('keys steps by stable id, independent of any ordering', () => {
    ProgressService.recordValidation('project-1', 'roadmap-1', 'step-c', true, '2026-07-16T10:00:00.000Z', file);
    ProgressService.recordValidation('project-1', 'roadmap-1', 'step-a', true, '2026-07-16T10:01:00.000Z', file);

    const progress = ProgressService.getProgress('project-1', 'roadmap-1', file);

    expect(progress.steps['step-a'].passed).toBe(true);
    expect(progress.steps['step-c'].passed).toBe(true);
  });

  it('resetProgress removes only the targeted (project, roadmap) entry', () => {
    ProgressService.recordValidation('project-1', 'roadmap-1', 'step-a', true, '2026-07-16T10:00:00.000Z', file);
    ProgressService.recordValidation('project-1', 'roadmap-2', 'step-a', true, '2026-07-16T10:00:00.000Z', file);
    ProgressService.recordValidation('project-2', 'roadmap-1', 'step-a', true, '2026-07-16T10:00:00.000Z', file);

    ProgressService.resetProgress('project-1', 'roadmap-1', file);

    expect(ProgressService.getProgress('project-1', 'roadmap-1', file).steps).toEqual({});
    expect(ProgressService.getProgress('project-1', 'roadmap-2', file).steps).not.toEqual({});
    expect(ProgressService.getProgress('project-2', 'roadmap-1', file).steps).not.toEqual({});
  });

  it('deleteProjectProgress removes every roadmap entry of the project, nothing else', () => {
    ProgressService.recordValidation('project-1', 'roadmap-1', 'step-a', true, '2026-07-16T10:00:00.000Z', file);
    ProgressService.recordValidation('project-1', 'roadmap-2', 'step-a', true, '2026-07-16T10:00:00.000Z', file);
    ProgressService.recordValidation('project-2', 'roadmap-1', 'step-a', true, '2026-07-16T10:00:00.000Z', file);

    ProgressService.deleteProjectProgress('project-1', file);

    expect(ProgressService.getProgress('project-1', 'roadmap-1', file).steps).toEqual({});
    expect(ProgressService.getProgress('project-1', 'roadmap-2', file).steps).toEqual({});
    expect(ProgressService.getProgress('project-2', 'roadmap-1', file).steps).not.toEqual({});
  });

  describe('listProgress', () => {
    it('returns an empty list when no store exists', () => {
      expect(ProgressService.listProgress(file)).toEqual([]);
      expect(fs.existsSync(file)).toBe(false);
    });

    it('summarizes every entry with its count of passed steps', () => {
      ProgressService.recordValidation('project-1', 'roadmap-1', 'step-a', true, '2026-07-16T10:00:00.000Z', file);
      ProgressService.recordValidation('project-1', 'roadmap-1', 'step-b', false, '2026-07-16T10:01:00.000Z', file);
      ProgressService.recordValidation('project-1', 'roadmap-1', 'step-c', true, '2026-07-16T10:02:00.000Z', file);
      ProgressService.recordValidation('project-2', 'roadmap-2', 'step-a', false, '2026-07-16T10:03:00.000Z', file);

      const summaries = ProgressService.listProgress(file);

      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toMatchObject({ projectId: 'project-1', roadmapId: 'roadmap-1', completedSteps: 2 });
      expect(summaries[0].updatedAt).not.toBe('');
      expect(summaries[1]).toMatchObject({ projectId: 'project-2', roadmapId: 'roadmap-2', completedSteps: 0 });
    });

    it('does not consume the one-shot storeRecovered flag reserved for getProgress', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.writeFileSync(file, 'not json at all {');

      expect(ProgressService.listProgress(file)).toEqual([]);

      // The recovery notice must still reach the player's next per-pair read.
      expect(ProgressService.getProgress('project-1', 'roadmap-1', file).storeRecovered).toBe(true);
      errorSpy.mockRestore();
    });
  });

  describe('unreadable store recovery', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('moves a corrupt file aside, starts fresh and reports the recovery once', () => {
      fs.writeFileSync(file, 'not json at all {');

      const first = ProgressService.getProgress('project-1', 'roadmap-1', file);
      expect(first.steps).toEqual({});
      expect(first.storeRecovered).toBe(true);
      expect(fs.readFileSync(`${file}.corrupt`, 'utf-8')).toBe('not json at all {');

      const second = ProgressService.getProgress('project-1', 'roadmap-1', file);
      expect(second.storeRecovered).toBeUndefined();
    });

    it('treats an unknown store version like corruption — never guesses', () => {
      fs.writeFileSync(file, JSON.stringify({ version: 99, entries: [] }));

      const progress = ProgressService.getProgress('project-1', 'roadmap-1', file);

      expect(progress.steps).toEqual({});
      expect(progress.storeRecovered).toBe(true);
      expect(fs.existsSync(`${file}.corrupt`)).toBe(true);
    });

    it('keeps working after recovery: new writes land in a fresh store', () => {
      fs.writeFileSync(file, '{broken');

      ProgressService.recordValidation('project-1', 'roadmap-1', 'step-a', true, '2026-07-16T10:00:00.000Z', file);

      const progress = ProgressService.getProgress('project-1', 'roadmap-1', file);
      expect(progress.steps['step-a'].passed).toBe(true);
      // The recovery happened on the write path — still reported on the next read.
      expect(progress.storeRecovered).toBe(true);
    });
  });
});
