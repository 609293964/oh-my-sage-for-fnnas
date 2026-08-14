import assert from 'node:assert/strict';
import test from 'node:test';
import type { GatewayClient } from '../../src/core/gateway/client';
import { getDevice } from '../../src/core/tools/device';

test('解析同一 service 的事件参数并为缺失属性提供 fallback', async () => {
    const gateway = {
        callApi: async () => ({
            devList: {
                dev1: {
                    name: '测试双键',
                    model: 'test.remote',
                    modelName: '测试遥控器',
                    online: true,
                    roomName: '测试房间',
                    urn: 'urn:test:remote',
                },
            },
        }),
    } as unknown as GatewayClient;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
        services: [{
            iid: 3,
            description: 'remote-control',
            properties: [{
                iid: 1,
                description: 'button-id',
                format: 'uint8',
                'value-list': [{ value: 1, description: 'left' }, { value: 2, description: 'right' }],
            }],
            events: [{ iid: 1012, description: 'click', arguments: [1, 99] }],
        }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });

    try {
        const result = await getDevice(gateway, ['dev1']);
        assert.equal(result.success, true);
        if (!result.success) return;

        const event = result.data?.[0].triggers?.find((trigger) => trigger.type === 'event');
        assert.deepEqual(event?.arguments?.[0], {
            siid: 3,
            piid: 1,
            desc: 'remote-control-button-id',
            dtype: 'uint8',
            access: [],
            list: [{ value: 1, description: 'left' }, { value: 2, description: 'right' }],
        });
        assert.deepEqual(event?.arguments?.[1], {
            siid: 3,
            piid: 99,
            desc: 'Property 99',
            dtype: 'unknown',
            access: [],
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('网关设备表中不存在的设备ID标记为 found=false，且不与离线设备混淆', async () => {
    const gateway = {
        callApi: async () => ({
            devList: {
                offlineDev: {
                    name: '已离线设备',
                    model: 'test.offline',
                    modelName: '测试离线设备',
                    online: false,
                    roomName: '测试房间',
                    urn: '',
                },
            },
        }),
    } as unknown as GatewayClient;

    const result = await getDevice(gateway, ['offlineDev', 'missingDev']);
    assert.equal(result.success, true);

    const offline = result.data?.find((device) => device.did === 'offlineDev');
    assert.equal(offline?.found, true, '离线设备仍然存在于设备表，found 必须为 true');
    assert.equal(offline?.online, false);
    assert.equal(offline?.name, '已离线设备');

    const missing = result.data?.find((device) => device.did === 'missingDev');
    assert.equal(missing?.found, false, '设备表中不存在的 ID 必须标记 found=false');
    assert.equal(missing?.online, false);
    assert.equal(missing?.name, '');
});
