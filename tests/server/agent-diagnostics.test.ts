import assert from 'node:assert/strict';
import test from 'node:test';
import {compactToolResult, formatAgentError} from '../../src/server/agent/diagnostics';

test('compactToolResult replaces skill content with a diagnostic summary', () => {
    const result = compactToolResult('read_skill_file', {
        success: true,
        filePath: 'references/mijia-complete-reference.md',
        content: '米家'.repeat(100),
    });

    assert.equal(result.success, true);
    assert.equal(result.content, undefined);
    assert.equal(result.contentLength, 200);
    assert.match(result.message, /200 字符/);
});

test('formatAgentError keeps useful messages for Error and provider objects', () => {
    assert.equal(formatAgentError(new Error('连接超时')), '连接超时');
    assert.equal(formatAgentError({message: 'Unexpected response type: 4'}), 'Unexpected response type: 4');
});

test('formatAgentError exposes a safe cause and code for terminated streams', () => {
    const error = new TypeError('terminated', {
        cause: Object.assign(new Error('other side closed'), {code: 'UND_ERR_SOCKET'}),
    });
    const message = formatAgentError(error);

    assert.match(message, /模型 API 流连接被提前关闭/);
    assert.match(message, /code=UND_ERR_SOCKET/);
    assert.match(message, /cause=other side closed/);
    assert.doesNotMatch(message, /api[_-]?key/i);
});

test('formatAgentError classifies upstream temporary failures and decodes HTML spaces', () => {
    const message = formatAgentError({
        message: 'Failed after 3 attempts. Last error: Service temporarily unavailable &#x20;',
        statusCode: 503,
    });

    assert.match(message, /上游模型服务暂时不可用/);
    assert.match(message, /code=503/);
    assert.doesNotMatch(message, /&#x20;/);
});
