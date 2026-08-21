/**
 * Core - maintenance/debug tools.
 */

import { GatewayClient } from '../gateway/client';
import type { ToolResponse } from '../types';

export const READ_ONLY_GATEWAY_METHODS = new Set([
    'getApiList',
    'getBackupConfig',
    'getBackupList',
    'getBackupProgress',
    'getDevList',
    'getGraph',
    'getGraphList',
    'getLog',
    'getVarConfig',
    'getVarList',
    'getVarScopeList',
    'getVarValue',
]);

function getApiCatalog(): ToolResponse<{
    source: 'local-compatibility-catalog';
    gatewayQueried: false;
    methods: string[];
    recommendedTools: string[];
}> {
    return {
        success: true,
        data: {
            source: 'local-compatibility-catalog',
            gatewayQueried: false,
            methods: [...READ_ONLY_GATEWAY_METHODS],
            recommendedTools: ['get_devices', 'get_device', 'get_graphs', 'get_graph', 'get_variables'],
        },
        message: '返回本应用已验证的兼容接口清单；当前网关不实现 /api/getApiList，因此未向网关发送该请求。',
    };
}

export async function callGatewayApi(
    gateway: GatewayClient,
    method: string,
    params: Record<string, unknown> = {},
    timeout: number = 10000
): Promise<ToolResponse<unknown>> {
    if (method === 'getApiList') return getApiCatalog();

    if (!READ_ONLY_GATEWAY_METHODS.has(method)) {
        return {
            success: false,
            error: `方法 ${method} 不在已验证的只读 API 白名单中`,
        };
    }

    try {
        const data = await gateway.callApi(method, params, timeout);
        return { success: true, data };
    } catch (error) {
        return { success: false, error: `调用网关 API 失败: ${error}` };
    }
}
