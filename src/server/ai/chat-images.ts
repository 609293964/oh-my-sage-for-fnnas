export function hasValidImageSignature(data: Uint8Array, mimeType: string): boolean {
    const startsWith = (...bytes: number[]) => bytes.every((byte, index) => data[index] === byte);

    switch (mimeType) {
        case 'image/png':
            return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
        case 'image/jpeg':
            return startsWith(0xff, 0xd8, 0xff);
        case 'image/gif':
            return startsWith(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) ||
                startsWith(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
        case 'image/webp':
            return startsWith(0x52, 0x49, 0x46, 0x46) &&
                data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50;
        default:
            return false;
    }
}
