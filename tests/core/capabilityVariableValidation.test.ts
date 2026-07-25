import assert from 'node:assert/strict';
import test from 'node:test';
import type { GatewayClient } from '../../src/core/gateway/client';
import type { GraphNode } from '../../src/core/types/graph';
import { validateGraphVariablesWithGateway } from '../../src/core/tools/capabilityValidation';

const node = (type: string, props: Record<string, unknown>): GraphNode => ({
    id: type,
    type,
    cfg: {},
    props,
    inputs: {},
    outputs: {},
});

test('变量能力校验拒绝不存在和类型错误的规则变量', async () => {
    const calls: string[] = [];
    const gateway = {
        async callApi(_method: string, params: { scope: string }): Promise<unknown> {
            calls.push(params.scope);
            return {
                numberVar: { type: 'number', value: 0, userData: { name: 'Number' } },
                stringVar: { type: 'string', value: '', userData: { name: 'String' } },
            };
        },
    } as unknown as GatewayClient;

    const errors = await validateGraphVariablesWithGateway(gateway, [
        node('varSetNumber', { id: 'numberVar', scope: 'R1', elements: [{ type: 'var', id: 'missingVar', scope: 'R1' }] }),
        node('deviceOutput', { aiid: 3, ins: [{ piid: 1, id: 'numberVar', scope: 'R1', dtype: 'string' }] }),
        node('varSetString', { id: 'stringVar', scope: 'R1', elements: [{ type: 'var', id: 'numberVar', scope: 'R1' }] }),
    ]);

    assert.deepEqual(calls, ['R1']);
    assert.deepEqual(errors.map((item) => item.type), ['unknown_variable', 'variable_type_mismatch']);
});

test('变量能力校验接受数组形式的真实变量列表', async () => {
    const gateway = {
        async callApi(): Promise<unknown> {
            return [{ id: 'message', type: 'string', value: '', userData: { name: 'Message' } }];
        },
    } as unknown as GatewayClient;

    const errors = await validateGraphVariablesWithGateway(gateway, [
        node('deviceOutput', { aiid: 3, ins: [{ piid: 1, id: 'message', scope: 'R1', dtype: 'string' }] }),
    ]);
    assert.deepEqual(errors, []);
});

test('变量能力校验覆盖设备事件参数赋值', async () => {
    const gateway = {
        async callApi(): Promise<unknown> { return {}; },
    } as unknown as GatewayClient;

    const errors = await validateGraphVariablesWithGateway(gateway, [
        node('deviceInputSetVar', { arguments: [{ piid: 1, dtype: 'number', id: 'missing', scope: 'R1' }] }),
    ]);

    assert.deepEqual(errors.map((item) => item.type), ['unknown_variable']);
});
