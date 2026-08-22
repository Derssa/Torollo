import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { validateRoadmap } from '../format/validateRoadmap';
import { RoadmapDirs, RoadmapService, USER_ROADMAPS_DIR } from './roadmapService';

/** One roadmap file the import accepted and installed. */
export interface ImportedRoadmap {
  /** Name of the uploaded file or archive entry the roadmap came from. */
  file: string;
  id: string;
  language: string;
  title: string;
  /** True when this import replaced a previously imported version. */
  updated: boolean;
}

/** One roadmap file the import refused, with the reasons a user can act on. */
export interface RejectedFile {
  file: string;
  errors: string[];
}

/** Outcome of one upload (POST /api/learning/roadmaps/import). */
export interface ImportReport {
  imported: ImportedRoadmap[];
  rejected: RejectedFile[];
  /** Archive entries that are not roadmap files (README, images…) — skipped, not an error. */
  ignored: string[];
}

// An upload is a couple of hand-written JSON files, possibly zipped. Anything
// bigger than these caps is not a roadmap pack — refuse it before inflating.
const MAX_ENTRIES = 200;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;

/** Local zip files start with "PK\x03\x04" — content, not file names, decides the path. */
function isZip(data: Buffer): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

interface CandidateFile {
  /** Base name of the upload or archive entry — used in the report only. */
  name: string;
  data: Buffer;
}

/**
 * Installs uploaded roadmaps into the user roadmaps directory
 * (~/.torollo/roadmaps/), where the catalogue picks them up.
 *
 * Every file is fully validated against the roadmap format before anything is
 * written, and each one succeeds or fails on its own: one broken file in an
 * archive never blocks the others. Installed files are named
 * `<id>.<language>.json` — both fields are schema-constrained to safe
 * characters, and the deterministic name is what makes re-importing a fixed
 * or updated pack an in-place update.
 */
export class RoadmapImportService {
  public static importUpload(
    data: Buffer,
    fileName: string,
    dirs: RoadmapDirs = {}
  ): ImportReport {
    const report: ImportReport = { imported: [], rejected: [], ignored: [] };
    const name = path.basename(fileName || 'upload');

    let candidates: CandidateFile[];
    if (isZip(data)) {
      try {
        candidates = this.unpackArchive(data, report);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        report.rejected.push({ file: name, errors: [`not a readable zip archive: ${reason}`] });
        return report;
      }
      if (candidates.length === 0 && report.rejected.length === 0) {
        report.rejected.push({ file: name, errors: ['the archive contains no .json roadmap file'] });
        return report;
      }
    } else {
      candidates = [{ name, data }];
    }

    const builtinKeys = RoadmapService.builtinKeys(dirs);
    const userDir = dirs.userDir ?? USER_ROADMAPS_DIR;
    // Keys already accepted from this same upload: a second file with the same
    // (id, language) would silently overwrite the first, so it is refused.
    const accepted = new Map<string, string>();

    for (const candidate of candidates) {
      const outcome = this.importOne(candidate, { builtinKeys, accepted, userDir });
      if ('errors' in outcome) {
        report.rejected.push({ file: candidate.name, errors: outcome.errors });
      } else {
        report.imported.push(outcome);
      }
    }
    return report;
  }

  private static unpackArchive(data: Buffer, report: ImportReport): CandidateFile[] {
    const entries = new AdmZip(data).getEntries().filter(entry => !entry.isDirectory);
    if (entries.length > MAX_ENTRIES) {
      throw new Error(`too many files (${entries.length}, limit ${MAX_ENTRIES})`);
    }

    const candidates: CandidateFile[] = [];
    for (const entry of entries) {
      // Entry names come from the archive: only their base name is ever used,
      // and only for reporting — the installed file name derives from the
      // validated roadmap content, so a hostile path can't escape the dir.
      const name = path.basename(entry.entryName);
      if (!name.endsWith('.json')) {
        report.ignored.push(name);
        continue;
      }
      if (entry.header.size > MAX_ENTRY_BYTES) {
        report.rejected.push({
          file: name,
          errors: [`file is larger than the ${MAX_ENTRY_BYTES / 1024 / 1024} MB limit for a roadmap`],
        });
        continue;
      }
      candidates.push({ name, data: entry.getData() });
    }
    return candidates;
  }

  private static importOne(
    candidate: CandidateFile,
    ctx: { builtinKeys: Set<string>; accepted: Map<string, string>; userDir: string }
  ): ImportedRoadmap | { errors: string[] } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate.data.toString('utf-8'));
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return { errors: [`not valid JSON: ${reason}`] };
    }

    const result = validateRoadmap(parsed);
    if (!result.valid) {
      return { errors: result.errors };
    }

    const { id, language, title } = result.roadmap;
    const key = RoadmapService.key(id, language);
    if (ctx.builtinKeys.has(key)) {
      return {
        errors: [
          `"${id}" (${language}) is a roadmap shipped with Torollo — an import cannot replace it. ` +
            'Give your roadmap its own id.',
        ],
      };
    }
    const earlier = ctx.accepted.get(key);
    if (earlier !== undefined) {
      return { errors: [`same roadmap id and language as "${earlier}" in this upload`] };
    }

    const target = path.join(ctx.userDir, `${id}.${language}.json`);
    const updated = fs.existsSync(target);
    fs.mkdirSync(ctx.userDir, { recursive: true });
    // The original bytes, not a re-serialization: the file stays exactly what
    // its author wrote (formatting, key order).
    fs.writeFileSync(target, candidate.data);

    ctx.accepted.set(key, candidate.name);
    return { file: candidate.name, id, language, title, updated };
  }
}
