import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageName = 'fnnas.mijia-geek-ai';
const packDir = path.join(root, packageName);
const appDir = path.join(packDir, 'app');
const serverDir = path.join(appDir, 'server');
const standaloneDir = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');
const agentsDir = path.join(root, '.agents');
const packageJsonPath = path.join(root, 'package.json');
const manifestPaths = [
    path.join(packDir, 'manifest'),
    path.join(packDir, 'building', 'manifest'),
];

function assertExists(target, message) {
    if (!fs.existsSync(target)) {
        throw new Error(message);
    }
}

function copyIfExists(source, destination) {
    if (fs.existsSync(source)) {
        fs.cpSync(source, destination, { recursive: true, force: true });
    }
}

function syncManifestVersion(manifestPath, version) {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    if (!/^version\s*=.*$/m.test(manifest)) {
        throw new Error(`Missing version field in ${path.relative(root, manifestPath)}`);
    }
    const synced = manifest.replace(/^version\s*=.*$/m, `version=${version}`);
    if (synced !== manifest) fs.writeFileSync(manifestPath, synced);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (typeof packageJson.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
    throw new Error('package.json version must use semantic version format, for example 0.0.4');
}
for (const manifestPath of manifestPaths) syncManifestVersion(manifestPath, packageJson.version);

assertExists(
    standaloneDir,
    'Missing .next/standalone. Run `npm run build` before `npm run prepare:fpk`.'
);
assertExists(staticDir, 'Missing .next/static. Run `npm run build` before `npm run prepare:fpk`.');

fs.rmSync(serverDir, { recursive: true, force: true });
fs.mkdirSync(serverDir, { recursive: true });

fs.cpSync(standaloneDir, serverDir, { recursive: true, force: true });
copyIfExists(staticDir, path.join(serverDir, '.next', 'static'));
copyIfExists(publicDir, path.join(serverDir, 'public'));
copyIfExists(agentsDir, path.join(serverDir, '.agents'));

try {
    const cmdDir = path.join(packDir, 'cmd');
    for (const entry of fs.readdirSync(cmdDir, { withFileTypes: true })) {
        if (entry.isFile()) {
            fs.chmodSync(path.join(cmdDir, entry.name), 0o755);
        }
    }
} catch (error) {
    console.warn(`[prepare:fpk] Unable to chmod cmd scripts: ${error.message}`);
}

console.log(`[prepare:fpk] Prepared ${path.relative(root, serverDir)}`);
