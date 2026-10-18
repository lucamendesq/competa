import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIRS_TO_SCAN = [path.resolve(__dirname, '../src'), path.resolve(__dirname, '../public')];

const PROHIBITED_PATTERNS = [
  'rotate-45',
  'rotate(45',
  'rotate-[-45',
  'rotate-[45deg]',
  'rotate-[-45deg]',
  '-rotate-45',
  'diamond',
];

const EXTENSIONS = new Set(['.vue', '.ts', '.css', '.svg']);

interface Offense {
  file: string;
  line: number;
  pattern: string;
  content: string;
}

function getFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(fullPath));
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = DIRS_TO_SCAN.flatMap((dir) => getFiles(dir));
const offenses: Offense[] = [];

for (const filePath of allFiles) {
  const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    for (const pattern of PROHIBITED_PATTERNS) {
      if (lineText.includes(pattern)) {
        offenses.push({
          file: relativePath,
          line: i + 1,
          pattern,
          content: lineText.trim(),
        });
      }
    }
  }
}

if (offenses.length > 0) {
  console.error(`Prohibited diamond / 45deg patterns found (${offenses.length} occurrence(s)):`);
  for (const offense of offenses) {
    console.error(
      `  ${offense.file}:${offense.line} [found: "${offense.pattern}"] -> ${offense.content}`,
    );
  }
  process.exit(1);
}

console.log('check-no-diamond: ok');
process.exit(0);
