import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageName = 'fnnas.mijia-geek-ai';
const packDir = path.join(root, packageName);
const appDir = path.join(packDir, 'app');
const manifestPath = path.join(packDir, 'manifest');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifestSource = fs.readFileSync(manifestPath, 'utf8');
const platform = manifestSource.match(/^platform\s*=\s*(.+)$/m)?.[1]?.trim();
const manifestVersion = manifestSource.match(/^version\s*=\s*(.+)$/m)?.[1]?.trim();
const serverDir = path.join(appDir, 'server');
const linkManifestPath = path.join(root, '.next', 'standalone-symlinks.json');
const standaloneLinks = fs.existsSync(linkManifestPath)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(linkManifestPath, 'utf8'))))
    : new Map();

if (!platform) throw new Error('Missing platform field in manifest');
if (!/^checksum\s*=.*$/m.test(manifestSource)) throw new Error('Missing checksum field in manifest');
if (manifestVersion !== packageJson.version) {
    throw new Error('Manifest version is out of sync. Run `npm run prepare:fpk` first.');
}
if (!fs.existsSync(path.join(appDir, 'server', 'server.js'))) {
    throw new Error('Missing prepared server. Run `npm run prepare:fpk` first.');
}

const BLOCK_SIZE = 512;

function writeString(buffer, value, offset, length) {
    Buffer.from(value).copy(buffer, offset, 0, length);
}

function writeOctal(buffer, value, offset, length) {
    const encoded = `${Math.max(0, value).toString(8).padStart(length - 1, '0')}\0`;
    writeString(buffer, encoded, offset, length);
}

function createHeader(name, size, mode, type, mtime, linkName = '') {
    const header = Buffer.alloc(BLOCK_SIZE);
    writeString(header, Buffer.byteLength(name) <= 100 ? name : name.slice(-100), 0, 100);
    writeOctal(header, mode, 100, 8);
    writeOctal(header, 0, 108, 8);
    writeOctal(header, 0, 116, 8);
    writeOctal(header, size, 124, 12);
    writeOctal(header, Math.floor(mtime / 1000), 136, 12);
    header.fill(0x20, 148, 156);
    header[156] = type.charCodeAt(0);
    if (linkName) writeString(header, Buffer.byteLength(linkName) <= 100 ? linkName : linkName.slice(-100), 157, 100);
    writeString(header, 'ustar\0', 257, 6);
    writeString(header, '00', 263, 2);
    writeString(header, 'root', 265, 32);
    writeString(header, 'root', 297, 32);
    writeOctal(header, 0, 329, 8);
    writeOctal(header, 0, 337, 8);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeString(header, `${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8);
    return header;
}

class TarBuilder {
    constructor() {
        this.parts = [];
    }

    addLongName(name, mtime) {
        if (Buffer.byteLength(name) <= 100) return;
        const data = Buffer.from(`${name}\0`);
        this.addRaw('././@LongLink', data, 0o644, 'L', mtime, '', false);
    }

    addLongLink(linkName, mtime) {
        if (Buffer.byteLength(linkName) <= 100) return;
        const data = Buffer.from(`${linkName}\0`);
        this.addRaw('././@LongLink', data, 0o644, 'K', mtime, '', false);
    }

    addRaw(name, data, mode, type, mtime, linkName = '', includeLongName = true) {
        if (includeLongName) this.addLongName(name, mtime);
        if (includeLongName && linkName) this.addLongLink(linkName, mtime);
        this.parts.push(createHeader(name, data.length, mode, type, mtime, linkName));
        if (data.length > 0) this.parts.push(data);
        const padding = (BLOCK_SIZE - (data.length % BLOCK_SIZE)) % BLOCK_SIZE;
        if (padding) this.parts.push(Buffer.alloc(padding));
    }

    addBuffer(name, data, mode = 0o644, mtime = Date.now()) {
        this.addRaw(name.replaceAll('\\', '/'), data, mode, '0', mtime);
    }

    finish() {
        this.parts.push(Buffer.alloc(BLOCK_SIZE * 2));
        return Buffer.concat(this.parts);
    }
}

function collectPath(source, archiveName, executable, entries) {
    const stat = fs.statSync(source);
    const normalized = archiveName.replaceAll('\\', '/');
    const relativeToServer = path.relative(serverDir, source).replaceAll('\\', '/');
    const isInsideServer = relativeToServer !== '..' && !relativeToServer.startsWith('../') && !path.isAbsolute(relativeToServer);
    const linkName = isInsideServer ? standaloneLinks.get(relativeToServer) : undefined;
    if (linkName) {
        entries.push({
            name: normalized,
            data: Buffer.alloc(0),
            mode: 0o777,
            type: '2',
            mtime: stat.mtimeMs,
            linkName,
        });
        return;
    }
    if (stat.isDirectory()) {
        entries.push({
            name: normalized.endsWith('/') ? normalized : `${normalized}/`,
            data: Buffer.alloc(0),
            mode: 0o755,
            type: '5',
            mtime: stat.mtimeMs,
        });
        for (const entry of fs.readdirSync(source, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            collectPath(path.join(source, entry.name), `${normalized}/${entry.name}`, executable, entries);
        }
        return;
    }
    entries.push({
        name: normalized,
        source,
        mode: executable ? 0o755 : 0o644,
        type: '0',
        mtime: stat.mtimeMs,
    });
}

async function addPaths(builder, specs) {
    const entries = [];
    for (const spec of specs) collectPath(spec.source, spec.name, spec.executable ?? false, entries);

    const files = entries.filter(entry => entry.source);
    for (let index = 0; index < files.length; index += 64) {
        await Promise.all(files.slice(index, index + 64).map(async entry => {
            entry.data = await fs.promises.readFile(entry.source);
        }));
    }
    for (const entry of entries) {
        builder.addRaw(entry.name, entry.data, entry.mode, entry.type, entry.mtime, entry.linkName ?? '');
    }
}

function gzipTar(builder, level) {
    return zlib.gzipSync(builder.finish(), {level});
}

const appTar = new TarBuilder();
await addPaths(appTar, [
    {source: path.join(appDir, 'server'), name: 'server'},
    {source: path.join(appDir, 'ui'), name: 'ui'},
]);
const appArchive = gzipTar(appTar, 6);
const appChecksum = crypto.createHash('md5').update(appArchive).digest('hex');
const outputManifest = manifestSource.replace(/^checksum\s*=.*$/m, `checksum=${appChecksum}`);

const outerTar = new TarBuilder();
outerTar.addBuffer('app.tgz', appArchive);
await addPaths(outerTar, [
    {source: path.join(packDir, 'LICENSE'), name: 'LICENSE'},
    {source: path.join(packDir, 'cmd'), name: 'cmd', executable: true},
    {source: path.join(packDir, 'config'), name: 'config'},
    {source: path.join(packDir, 'ICON.PNG'), name: 'ICON.PNG'},
    {source: path.join(packDir, 'ICON_256.PNG'), name: 'ICON_256.PNG'},
]);
outerTar.addBuffer('manifest', Buffer.from(outputManifest));
await addPaths(outerTar, [{source: path.join(packDir, 'wizard'), name: 'wizard'}]);
// app.tgz is already compressed, so a fast outer pass avoids wasting time.
const output = gzipTar(outerTar, 1);
const outputPath = path.join(root, `${packageName}_${packageJson.version}_${platform}.fpk`);
const temporaryPath = `${outputPath}.tmp`;

fs.writeFileSync(temporaryPath, output);
fs.copyFileSync(temporaryPath, outputPath);
fs.rmSync(temporaryPath, {force: true});

const sha256 = crypto.createHash('sha256').update(output).digest('hex');
console.log(`[pack:fpk] Created ${path.basename(outputPath)}`);
console.log(`[pack:fpk] Size: ${(output.length / 1024 / 1024).toFixed(2)} MiB`);
console.log(`[pack:fpk] app.tgz MD5: ${appChecksum}`);
console.log(`[pack:fpk] SHA-256: ${sha256}`);
