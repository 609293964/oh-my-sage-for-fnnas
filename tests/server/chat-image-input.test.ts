import assert from 'node:assert/strict';
import test from 'node:test';
import {hasValidImageSignature} from '../../src/server/ai/chat-images';

test('聊天图片校验接受支持格式的真实文件头', () => {
    assert.equal(hasValidImageSignature(Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]), 'image/png'), true);
    assert.equal(hasValidImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), true);
    assert.equal(hasValidImageSignature(Buffer.from('GIF89a'), 'image/gif'), true);
    assert.equal(hasValidImageSignature(Buffer.from('RIFFxxxxWEBP'), 'image/webp'), true);
});

test('聊天图片校验拒绝伪造 MIME 和不支持格式', () => {
    assert.equal(hasValidImageSignature(Buffer.from('not an image'), 'image/png'), false);
    assert.equal(hasValidImageSignature(Buffer.from('GIF89a'), 'image/svg+xml'), false);
});
