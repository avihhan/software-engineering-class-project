import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const distAssetsDir = join(process.cwd(), 'dist', 'assets');

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

async function main() {
  const files = await readdir(distAssetsDir);
  const sizes = [];

  for (const file of files) {
    const filePath = join(distAssetsDir, file);
    const fileStat = await stat(filePath);
    sizes.push({ file, bytes: fileStat.size });
  }

  sizes.sort((a, b) => b.bytes - a.bytes);

  const total = sizes.reduce((sum, f) => sum + f.bytes, 0);

  console.log('\nBundle size report (dist/assets):');
  for (const item of sizes) {
    console.log(`- ${item.file}: ${formatKb(item.bytes)}`);
  }
  console.log(`Total: ${formatKb(total)}\n`);
}

main().catch((err) => {
  console.error('Failed to generate bundle report:', err);
  process.exit(1);
});
