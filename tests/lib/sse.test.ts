import assert from 'node:assert/strict';
import test from 'node:test';
import {extractSseData} from '../../src/lib/sse';

test('extractSseData preserves a large event split across arbitrary chunks', () => {
    const expected = JSON.stringify({type: 'tool_result', result: {content: '米'.repeat(35264)}});
    const stream = `data: ${expected}\n\ndata: [DONE]\n\n`;
    const data: string[] = [];
    let rest = '';

    for (let offset = 0, size = 1; offset < stream.length; size = size % 97 + 1) {
        rest += stream.slice(offset, offset + size);
        offset += size;
        const extracted = extractSseData(rest);
        data.push(...extracted.data);
        rest = extracted.rest;
    }

    assert.deepEqual(data, [expected, '[DONE]']);
    assert.equal(rest, '');
    assert.deepEqual(JSON.parse(data[0]), JSON.parse(expected));
});

test('extractSseData supports CRLF and flushes the final event', () => {
    const extracted = extractSseData('data: {"type":"complete"}\r\n', true);
    assert.deepEqual(extracted.data, ['{"type":"complete"}']);
    assert.equal(extracted.rest, '');
});
