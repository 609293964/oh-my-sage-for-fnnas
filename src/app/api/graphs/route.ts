/**
 * 规则 API 路由
 * 从网关获取、创建、更新、删除米家自动化规则 (Graph)
 */

import {NextRequest, NextResponse} from 'next/server';
import {
    createGraph,
    deleteGraph,
    getGraph,
    getGraphs,
    toggleGraph,
    updateGraph,
    type CreateGraphInput,
    type GatewayClient,
    type GraphNode,
    type ToolResponse,
} from '@/core';
import {getGateway, isGatewayConnected} from '@/server/gateway/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

class ApiError extends Error {
    constructor(message: string, public status: number = 400) {
        super(message);
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getConnectedGateway(): GatewayClient | null {
    if (!isGatewayConnected()) return null;
    return getGateway();
}

function gatewayUnavailableResponse() {
    return NextResponse.json({
        success: false,
        error: '未连接到网关',
        message: '请先登录连接网关',
    }, {status: 400});
}

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        throw new ApiError('请求体必须是合法 JSON');
    }

    if (!isPlainObject(body)) {
        throw new ApiError('请求体必须是 JSON 对象');
    }

    return body;
}

function readRequiredString(body: Record<string, unknown>, field: string): string {
    const value = body[field];
    if (typeof value !== 'string' || !value.trim()) {
        throw new ApiError(`缺少 ${field} 或 ${field} 不是有效字符串`);
    }

    return value.trim();
}

function readOptionalString(body: Record<string, unknown>, field: string): string | undefined {
    if (!(field in body)) return undefined;

    const value = body[field];
    if (typeof value !== 'string' || !value.trim()) {
        throw new ApiError(`${field} 必须是非空字符串`);
    }

    return value.trim();
}

function readOptionalBoolean(body: Record<string, unknown>, field: string): boolean | undefined {
    if (!(field in body)) return undefined;

    const value = body[field];
    if (typeof value !== 'boolean') {
        throw new ApiError(`${field} 参数必须为布尔值`);
    }

    return value;
}

function readRequiredNodes(body: Record<string, unknown>): GraphNode[] {
    const value = body.nodes;
    if (!Array.isArray(value)) {
        throw new ApiError('nodes 必须是数组');
    }

    return value as GraphNode[];
}

function readOptionalNodes(body: Record<string, unknown>): GraphNode[] | undefined {
    if (!('nodes' in body)) return undefined;
    return readRequiredNodes(body);
}

function statusFromToolError(error: string): number {
    if (error.includes('不存在')) return 404;
    if (error.includes('校验失败') || error.includes('缺少') || error.includes('必须')) return 400;
    return 500;
}

function toolErrorResponse(result: ToolResponse) {
    if (result.success) {
        throw new Error('toolErrorResponse 只能处理失败结果');
    }

    return NextResponse.json({
        success: false,
        error: result.error,
        message: result.error,
    }, {status: statusFromToolError(result.error)});
}

function routeErrorResponse(error: unknown, fallback: string) {
    if (error instanceof ApiError) {
        return NextResponse.json({
            success: false,
            error: error.message,
            message: error.message,
        }, {status: error.status});
    }

    console.error(fallback, error);

    return NextResponse.json({
        success: false,
        error: fallback,
        message: error instanceof Error ? error.message : '未知错误',
    }, {status: 500});
}

/**
 * GET /api/graphs
 * 获取规则列表；传入 ?id=xxx 时获取规则详情。
 */
export async function GET(request: NextRequest) {
    try {
        const gateway = getConnectedGateway();
        if (!gateway) return gatewayUnavailableResponse();

        const {searchParams} = new URL(request.url);
        const id = searchParams.get('id')?.trim();

        if (id) {
            const result = await getGraph(gateway, id);
            if (!result.success) return toolErrorResponse(result);

            return NextResponse.json({
                success: true,
                graph: result.data,
            });
        }

        const result = await getGraphs(gateway);
        if (!result.success) return toolErrorResponse(result);

        const graphs = (result.data || []).map(graph => ({
            id: graph.id,
            name: graph.name,
            enable: graph.enable,
            createTime: graph.createTime,
            lastUpdateTime: graph.updateTime,
        }));

        return NextResponse.json({
            success: true,
            count: graphs.length,
            graphs,
        });
    } catch (error) {
        return routeErrorResponse(error, '获取规则失败');
    }
}

/**
 * POST /api/graphs
 * 创建新规则。
 */
export async function POST(request: NextRequest) {
    try {
        const gateway = getConnectedGateway();
        if (!gateway) return gatewayUnavailableResponse();

        const body = await readBody(request);
        const name = readRequiredString(body, 'name');
        const nodes = readRequiredNodes(body);
        const enable = readOptionalBoolean(body, 'enable') ?? true;

        const result = await createGraph(gateway, {name, nodes, enable});
        if (!result.success) return toolErrorResponse(result);

        return NextResponse.json({
            success: true,
            message: result.message,
            graphId: result.data?.graphId,
            data: result.data,
        }, {status: 201});
    } catch (error) {
        return routeErrorResponse(error, '创建规则失败');
    }
}

/**
 * PUT /api/graphs
 * 更新规则名称、节点或启用状态。
 */
export async function PUT(request: NextRequest) {
    try {
        const gateway = getConnectedGateway();
        if (!gateway) return gatewayUnavailableResponse();

        const body = await readBody(request);
        const id = readRequiredString(body, 'id');
        const input: Partial<CreateGraphInput> = {};

        const name = readOptionalString(body, 'name');
        const nodes = readOptionalNodes(body);
        const enable = readOptionalBoolean(body, 'enable');

        if (name !== undefined) input.name = name;
        if (nodes !== undefined) input.nodes = nodes;
        if (enable !== undefined) input.enable = enable;

        if (Object.keys(input).length === 0) {
            throw new ApiError('至少需要提供 name、nodes 或 enable 中的一项');
        }

        const result = await updateGraph(gateway, id, input);
        if (!result.success) return toolErrorResponse(result);

        return NextResponse.json({
            success: true,
            message: result.message,
        });
    } catch (error) {
        return routeErrorResponse(error, '更新规则失败');
    }
}

/**
 * PATCH /api/graphs
 * 启用或禁用规则。
 */
export async function PATCH(request: NextRequest) {
    try {
        const gateway = getConnectedGateway();
        if (!gateway) return gatewayUnavailableResponse();

        const body = await readBody(request);
        const id = readRequiredString(body, 'id');
        const enable = readOptionalBoolean(body, 'enable');

        if (enable === undefined) {
            throw new ApiError('enable 参数必须为布尔值');
        }

        const result = await toggleGraph(gateway, id, enable);
        if (!result.success) return toolErrorResponse(result);

        return NextResponse.json({
            success: true,
            message: result.message,
        });
    } catch (error) {
        return routeErrorResponse(error, '修改规则状态失败');
    }
}

/**
 * DELETE /api/graphs?id=xxx
 * 删除规则。
 */
export async function DELETE(request: NextRequest) {
    try {
        const gateway = getConnectedGateway();
        if (!gateway) return gatewayUnavailableResponse();

        const {searchParams} = new URL(request.url);
        const id = searchParams.get('id')?.trim();

        if (!id) {
            throw new ApiError('缺少规则 ID');
        }

        const result = await deleteGraph(gateway, id);
        if (!result.success) return toolErrorResponse(result);

        return NextResponse.json({
            success: true,
            message: result.message,
        });
    } catch (error) {
        return routeErrorResponse(error, '删除规则失败');
    }
}
