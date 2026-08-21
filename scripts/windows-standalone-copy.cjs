const fs = require('node:fs');
const path = require('node:path');

const tracingRoot = process.env.FNNAS_TRACING_ROOT;
const standaloneRoot = process.env.FNNAS_STANDALONE_ROOT;

if (process.platform === 'win32' && tracingRoot && standaloneRoot) {
    const originalSymlink = fs.promises.symlink.bind(fs.promises);
    const linkManifestPath = path.join(path.dirname(standaloneRoot), 'standalone-symlinks.json');
    const links = new Map();
    try {
        fs.rmSync(linkManifestPath, {force: true});
    } catch {
    }

    process.once('exit', () => {
        const sorted = Object.fromEntries([...links.entries()].sort(([a], [b]) => a.localeCompare(b)));
        fs.writeFileSync(linkManifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
    });

    fs.promises.symlink = async function copyInsteadOfSymlink(target, destination, type) {
        const relative = path.relative(standaloneRoot, destination);
        const isInsideStandalone = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
        if (!isInsideStandalone) return originalSymlink(target, destination, type);

        const tracedSource = path.join(tracingRoot, relative);
        const realSource = await fs.promises.realpath(tracedSource);
        const stat = await fs.promises.stat(realSource);

        if (stat.isDirectory()) {
            const targetInStandalone = path.join(standaloneRoot, path.relative(tracingRoot, realSource));
            const relativeTarget = path.relative(path.dirname(destination), targetInStandalone).replaceAll('\\', '/');
            links.set(relative.replaceAll('\\', '/'), relativeTarget);
            // Next may reference descendants while tracing. A placeholder lets the
            // build finish; pack-fpk replaces it with a real Unix symlink.
            await fs.promises.mkdir(destination, {recursive: true});
        } else {
            await fs.promises.copyFile(realSource, destination);
        }
    };
}
