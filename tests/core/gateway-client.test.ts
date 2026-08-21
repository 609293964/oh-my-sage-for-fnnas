import assert from 'node:assert/strict';
import test from 'node:test';
import {gatewayAuthResponseError} from '../../src/core/gateway/client';

test('网关 ERROR 帧转换为可操作的认证提示', () => {
    const response = Buffer.concat([
        Buffer.from([4]),
        Buffer.from(JSON.stringify({code: 401, message: 'invalid passcode'})),
    ]);
    const error = gatewayAuthResponseError(response, 32, '密钥交换第一阶段');

    assert.match(error.message, /网关拒绝认证/);
    assert.match(error.message, /invalid passcode/);
    assert.match(error.message, /重新获取6位登录码/);
});

test('非 ERROR 的意外消息显示期望和实际类型', () => {
    const error = gatewayAuthResponseError(Buffer.from([5]), 33, '密钥交换第二阶段');
    assert.match(error.message, /期望消息类型 33/);
    assert.match(error.message, /实际收到 5/);
});
