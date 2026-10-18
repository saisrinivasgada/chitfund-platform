// Keep the failure evidence usable on a weak connection. Full simulator logs
// can grow to gigabytes; screenshots, command results and financial outcomes
// are uploaded separately without truncation.
import { existsSync, readdirSync, openSync, fstatSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

if (!process.env.RUNNER_TEMP) throw new Error('Select the CI evidence directory');
const root = join(homedir(), '.maestro', 'tests');
const chunks = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (['maestro.log', 'device-logcat.txt', 'device-simulator.log'].includes(entry.name)) {
      const fd = openSync(path, 'r');
      try {
        const size = fstatSync(fd).size;
        const length = Math.min(size, 2_000_000);
        const buffer = Buffer.alloc(length);
        readSync(fd, buffer, 0, length, size - length);
        const lines = buffer.toString('utf8').split('\n')
          .filter((line) => !line.includes('metadata CommandMetadata'))
          .slice(-500).map((line) => line.slice(0, 2000));
        chunks.push(`${path.slice(root.length + 1)}\n${lines.join('\n')}`);
      } finally { closeSync(fd); }
    }
  }
}
if (existsSync(root)) collect(root);
writeFileSync(join(process.env.RUNNER_TEMP, 'chitwise-driver-tail.log'), chunks.join('\n\n'));
