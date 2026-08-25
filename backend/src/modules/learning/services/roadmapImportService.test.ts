import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { RoadmapImportService } from './roadmapImportService';
import { RoadmapService } from './roadmapService';

const BUILTIN_DIR = path.resolve(__dirname, '__fixtures__/roadmaps');

function roadmapJson(id: string, language = 'en', title = `Roadmap ${id}`): string {
  return JSON.stringify({
    schemaVersion: 1,
    id,
    title,
    description: `Description of ${id}.`,
    language,
    steps: [
      {
        id: 'start-web',
        title: 'Start the web server',
        instruction: 'Create a node named `web` and start it.',
        validators: [{ type: 'container_running', params: { node: 'web' } }],
      },
    ],
  });
}

describe('RoadmapImportService', () => {
  let userDir: string;
  let dirs: { dir: string; userDir: string };

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'torollo-import-'));
    dirs = { dir: BUILTIN_DIR, userDir };
  });

  afterEach(() => {
    fs.rmSync(userDir, { recursive: true, force: true });
  });

  it('imports a single valid .json upload and the catalogue serves it', () => {
    const report = RoadmapImportService.importUpload(
      Buffer.from(roadmapJson('my-pack-roadmap')),
      'my-pack-roadmap.json',
      dirs
    );

    expect(report).toEqual({
      imported: [
        {
          file: 'my-pack-roadmap.json',
          id: 'my-pack-roadmap',
          language: 'en',
          title: 'Roadmap my-pack-roadmap',
          updated: false,
        },
      ],
      rejected: [],
      ignored: [],
    });
    expect(fs.existsSync(path.join(userDir, 'my-pack-roadmap.en.json'))).toBe(true);
    expect(RoadmapService.listRoadmaps(dirs)).toContainEqual(
      expect.objectContaining({ id: 'my-pack-roadmap', source: 'imported' })
    );
  });

  it('rejects a file that is not JSON, without writing anything', () => {
    const report = RoadmapImportService.importUpload(Buffer.from('{nope'), 'broken.json', dirs);

    expect(report.imported).toEqual([]);
    expect(report.rejected).toEqual([
      { file: 'broken.json', errors: [expect.stringContaining('not valid JSON')] },
    ]);
    expect(fs.readdirSync(userDir)).toEqual([]);
  });

  it('rejects a schema-invalid roadmap with the field-level errors', () => {
    const invalid = JSON.stringify({ schemaVersion: 1, id: 'x-roadmap', language: 'en', steps: [] });
    const report = RoadmapImportService.importUpload(Buffer.from(invalid), 'invalid.json', dirs);

    expect(report.imported).toEqual([]);
    expect(report.rejected[0].file).toBe('invalid.json');
    expect(report.rejected[0].errors.join('; ')).toContain('missing required field "title"');
  });

  it('refuses to shadow a shipped roadmap', () => {
    const report = RoadmapImportService.importUpload(
      Buffer.from(roadmapJson('fixture-roadmap')),
      'fixture-roadmap.json',
      dirs
    );

    expect(report.imported).toEqual([]);
    expect(report.rejected[0].errors[0]).toContain('shipped with Torollo');
    expect(fs.readdirSync(userDir)).toEqual([]);
  });

  it('imports each archive file on its own: valid ones install, broken ones report, extras are ignored', () => {
    const zip = new AdmZip();
    zip.addFile('pack/roadmap-one.json', Buffer.from(roadmapJson('pack-roadmap-one')));
    zip.addFile('pack/roadmap-two.json', Buffer.from(roadmapJson('pack-roadmap-two')));
    zip.addFile('pack/broken.json', Buffer.from('{nope'));
    zip.addFile('pack/README.md', Buffer.from('# Pack'));

    const report = RoadmapImportService.importUpload(zip.toBuffer(), 'pack.zip', dirs);

    expect(report.imported.map(entry => entry.id).sort()).toEqual([
      'pack-roadmap-one',
      'pack-roadmap-two',
    ]);
    expect(report.rejected).toEqual([
      { file: 'broken.json', errors: [expect.stringContaining('not valid JSON')] },
    ]);
    expect(report.ignored).toEqual(['README.md']);
    expect(fs.readdirSync(userDir).sort()).toEqual([
      'pack-roadmap-one.en.json',
      'pack-roadmap-two.en.json',
    ]);
  });

  it('re-importing the same roadmap updates it in place and says so', () => {
    RoadmapImportService.importUpload(Buffer.from(roadmapJson('my-pack-roadmap')), 'v1.json', dirs);
    const report = RoadmapImportService.importUpload(
      Buffer.from(roadmapJson('my-pack-roadmap', 'en', 'Roadmap v2')),
      'v2.json',
      dirs
    );

    expect(report.imported[0].updated).toBe(true);
    expect(fs.readdirSync(userDir)).toEqual(['my-pack-roadmap.en.json']);
    expect(
      RoadmapService.getRoadmap('my-pack-roadmap', dirs)?.title
    ).toBe('Roadmap v2');
  });

  it('rejects a second archive entry with the same (id, language) instead of silently overwriting', () => {
    const zip = new AdmZip();
    zip.addFile('a.json', Buffer.from(roadmapJson('pack-roadmap', 'en', 'First')));
    zip.addFile('b.json', Buffer.from(roadmapJson('pack-roadmap', 'en', 'Second')));

    const report = RoadmapImportService.importUpload(zip.toBuffer(), 'pack.zip', dirs);

    expect(report.imported).toHaveLength(1);
    expect(report.rejected).toEqual([
      { file: 'b.json', errors: [expect.stringContaining('same roadmap id and language')] },
    ]);
    expect(RoadmapService.getRoadmap('pack-roadmap', dirs)?.title).toBe('First');
  });

  it('keeps translations of one roadmap in the same archive apart', () => {
    const zip = new AdmZip();
    zip.addFile('en.json', Buffer.from(roadmapJson('pack-roadmap', 'en')));
    zip.addFile('fr.json', Buffer.from(roadmapJson('pack-roadmap', 'fr')));

    const report = RoadmapImportService.importUpload(zip.toBuffer(), 'pack.zip', dirs);

    expect(report.rejected).toEqual([]);
    expect(fs.readdirSync(userDir).sort()).toEqual([
      'pack-roadmap.en.json',
      'pack-roadmap.fr.json',
    ]);
  });

  it('rejects an oversized archive entry before parsing it', () => {
    const zip = new AdmZip();
    zip.addFile('huge.json', Buffer.alloc(5 * 1024 * 1024 + 1, 0x20));

    const report = RoadmapImportService.importUpload(zip.toBuffer(), 'pack.zip', dirs);

    expect(report.imported).toEqual([]);
    expect(report.rejected[0].errors[0]).toContain('larger than');
  });

  it('rejects an archive with no roadmap file at all', () => {
    const zip = new AdmZip();
    zip.addFile('README.md', Buffer.from('# Pack'));

    const report = RoadmapImportService.importUpload(zip.toBuffer(), 'pack.zip', dirs);

    expect(report.imported).toEqual([]);
    expect(report.rejected).toEqual([
      { file: 'pack.zip', errors: [expect.stringContaining('no .json roadmap file')] },
    ]);
  });

  it('reports corrupt zip bytes as one readable rejection', () => {
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32, 7)]);

    const report = RoadmapImportService.importUpload(corrupt, 'pack.zip', dirs);

    expect(report.imported).toEqual([]);
    expect(report.rejected[0].errors[0]).toContain('not a readable zip archive');
  });

  it('writes the author bytes untouched — formatting and key order survive the import', () => {
    const source = `{\n  "schemaVersion": 1,\n  "language": "en",\n  "id": "my-pack-roadmap",\n  "title": "T",\n  "description": "D",\n  "steps": [{ "id": "s", "title": "S", "instruction": "I", "validators": [{ "type": "container_running", "params": { "node": "web" } }] }]\n}`;

    RoadmapImportService.importUpload(Buffer.from(source), 'authored.json', dirs);

    expect(fs.readFileSync(path.join(userDir, 'my-pack-roadmap.en.json'), 'utf-8')).toBe(source);
  });
});
