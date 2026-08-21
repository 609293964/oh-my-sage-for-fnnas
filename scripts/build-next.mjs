import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const args = [];
const env = {...process.env};

if (process.platform === 'win32') {
    const preload = path.join(root, 'scripts', 'windows-standalone-copy.cjs');
    args.push('--require', preload);
    env.FNNAS_TRACING_ROOT = root;
    env.FNNAS_STANDALONE_ROOT = path.join(root, '.next', 'standalone');
}

args.push(nextBin, 'build', ...process.argv.slice(2));
const startedAt = Date.now();
const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
});

if (result.error) throw result.error;
console.log(`[build] Finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
process.exit(result.status ?? 1);
