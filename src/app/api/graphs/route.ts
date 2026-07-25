/**
 * 规则 API 路由
 * 从网关获取米家自动化规则 (Graph)
 */

import {NextRequest, NextResponse} from 'next/server';
import {getGateway, isGatewayConnected} from '@/server/gateway/shared';
import {createGraph, deleteGraph, toggleGraph, updateGraph} from '@/core';
import {z} from 'zod';

export const runtime = 'nodejs';

const variableSchema = z.discriminatedUnion('type', [
    z.object({id: z.string().regex(/^[a-zA-Z0-9]+$/), type: z.literal('number'), value: z.number(), name: z.string().trim().min(1).optional()}),
    z.object({id: z.string().regex(/^[a-zA-Z0-9]+$/), type: z.literal('string'), value: z.string(), name: z.string().trim().min(1).optional()}),
]);
const createSchema = z.object({name: z.string().trim().min(1), nodes: z.array(z.any()), variables: z.array(variableSchema).optional(), enable: z.boolean().optional()});
const updateSchema = z.object({id: z.string().min(1), name: z.string().trim().min(1).optional(), nodes: z.array(z.any()).optional(), enable: z.boolean().optional()}).refine(value => value.name !== undefined || value.nodes !== undefined || value.enable !== undefined, '至少提供一个更新字段');

/**
 * GET 请求处理
 * 从网关获取规则列表
 */
export async function GET() {
    try {
        // 检查网关连接
        if (!isGatewayConnected()) {
            return NextResponse.json({
                success: false,
                error: '未连接到网关',
                message: '请先登录连接网关',
                graphs: [],
            }, {status: 400});
        }

        const gateway = getGateway()!;

        // 获取规则列表
        const result = await gateway.callApi('getGraphList', {}, 10000);

        // 根据实际返回的数据结构，getGraphList 返回数组
        // 每个元素包含: id, userData.name, userData.lastUpdateTime, enable, uiType
        const graphList = Array.isArray(result) ? result : [];

        // 转换为摘要格式
        const graphSummaries = graphList.map((graph: any) => ({
            id: graph.id,
            name: graph.userData?.name || '未命名规则',
            enable: graph.enable !== false,  // 注意是 enable 不是 enabled
            lastUpdateTime: graph.userData?.lastUpdateTime,
        }));

        return NextResponse.json({
            success: true,
            count: graphSummaries.length,
            graphs: graphSummaries,
        });
    } catch (error) {
        console.error('获取规则列表错误:', error);

        return NextResponse.json({
            success: false,
            error: '获取规则列表失败',
            message: error instanceof Error ? error.message : '未知错误',
            graphs: [],
        }, {status: 500});
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!isGatewayConnected()) return NextResponse.json({success: false, error: '未连接到网关'}, {status: 400});
        const parsed = createSchema.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({success: false, error: '规则参数无效', details: parsed.error.issues}, {status: 400});
        const {name, nodes, variables, enable = true} = parsed.data;
        const result = await createGraph(getGateway()!, {name, nodes, variables, enable});
        return NextResponse.json(result, {status: result.success ? 201 : 502});
    } catch (error) {
        return NextResponse.json({success: false, error: `创建规则失败: ${error}`}, {status: 500});
    }
}

export async function PUT(request: NextRequest) {
    try {
        if (!isGatewayConnected()) return NextResponse.json({success: false, error: '未连接到网关'}, {status: 400});
        const parsed = updateSchema.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({success: false, error: '规则参数无效', details: parsed.error.issues}, {status: 400});
        const {id, name, nodes, enable} = parsed.data;
        const result = await updateGraph(getGateway()!, id, {name, nodes, enable});
        return NextResponse.json(result, {status: result.success ? 200 : 502});
    } catch (error) {
        return NextResponse.json({success: false, error: `更新规则失败: ${error}`}, {status: 500});
    }
}

/**
 * PATCH 请求处理
 * 启用/禁用规则
 */
export async function PATCH(request: NextRequest) {
    try {
        // 检查网关连接
        if (!isGatewayConnected()) {
            return NextResponse.json({
                success: false,
                error: '未连接到网关',
            }, {status: 400});
        }

        const body = await request.json();
        const {id, enable} = body;

        if (!id) {
            return NextResponse.json({
                success: false,
                error: '缺少规则 ID',
            }, {status: 400});
        }

        if (typeof enable !== 'boolean') {
            return NextResponse.json({
                success: false,
                error: 'enable 参数必须为布尔值',
            }, {status: 400});
        }

        const result = await toggleGraph(getGateway()!, id, enable);
        return NextResponse.json(result, {status: result.success ? 200 : 404});
    } catch (error) {
        console.error('修改规则状态错误:', error);

        return NextResponse.json({
            success: false,
            error: '修改规则状态失败',
            message: error instanceof Error ? error.message : '未知错误',
        }, {status: 500});
    }
}

/**
 * DELETE 请求处理
 * 删除规则
 */
export async function DELETE(request: NextRequest) {
    try {
        // 检查网关连接
        if (!isGatewayConnected()) {
            return NextResponse.json({
                success: false,
                error: '未连接到网关',
            }, {status: 400});
        }

        const {searchParams} = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({
                success: false,
                error: '缺少规则 ID',
            }, {status: 400});
        }

        const gateway = getGateway()!;

        const result = await deleteGraph(gateway, id);
        if (!result.success) {
            return NextResponse.json(result, {status: 500});
        }

        return NextResponse.json({
            success: true,
            message: result.message || '规则已删除',
        });
    } catch (error) {
        console.error('删除规则错误:', error);

        return NextResponse.json({
            success: false,
            error: '删除规则失败',
            message: error instanceof Error ? error.message : '未知错误',
        }, {status: 500});
    }
}
