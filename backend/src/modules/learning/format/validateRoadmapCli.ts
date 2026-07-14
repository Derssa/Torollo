/**
 * CLI to check a roadmap file against the format schema.
 *
 * Usage: npm run roadmap:validate -- <path/to/roadmap.json>
 */
import fs from 'fs';
import { validateRoadmap } from './validateRoadmap';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npm run roadmap:validate -- <path/to/roadmap.json>');
  process.exit(1);
}

let raw: string;
try {
  raw = fs.readFileSync(filePath, 'utf-8');
} catch (error) {
  console.error(`Cannot read ${filePath}: ${(error as Error).message}`);
  process.exit(1);
}

let data: unknown;
try {
  data = JSON.parse(raw);
} catch (error) {
  console.error(`${filePath} is not valid JSON: ${(error as Error).message}`);
  process.exit(1);
}

const result = validateRoadmap(data);
if (result.valid) {
  const { id, steps } = result.roadmap;
  console.log(`OK ${filePath} (roadmap "${id}", ${steps.length} step${steps.length > 1 ? 's' : ''})`);
  process.exit(0);
}

console.error(`${filePath} is not a valid roadmap:`);
for (const message of result.errors) {
  console.error(`  - ${message}`);
}
process.exit(1);
