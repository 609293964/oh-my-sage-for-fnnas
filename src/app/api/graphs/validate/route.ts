/**
 * 规则校验 API 路由
 * 离线校验 Graph 节点结构和连接完整性，不写入网关。
 */

import {NextRequest, NextResponse} from 'next/server';
import {validateGraph, type Graph, type GraphConfig, type GraphNode} from '@/core';

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

function readNodes(value: unknown): GraphNode[] {
    if (!Array.isArray(value)) {
        throw new ApiError('nodes 必须是数组');
    }

    return value as GraphNode[];
}

function readConfig(value: unknown): GraphConfig | undefined {
    if (value === undefined) return undefined;
    if (!isPlainObject(value)) {
        throw new ApiError('cfg 必须是对象');
    }

    return value as unknown as GraphConfig;
}

function buildFallbackConfig(body: Record<string, unknown>): GraphConfig {
    const id = typeof body.id === 'string' && body.id.trim()
        ? body.id.trim()
        : 'graph_preview';
    const name = typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : '未命名规则';
    const enable = typeof body.enable === 'boolean' ? body.enable : true;

    return {
        id,
        enable,
        uiType: 'graph',
        userData: {
            name,
            lastUpdateTime: Date.now(),
            transform: {x: 0, y: 0, scale: 1, rotate: 0},
        },
    };
}

function buildGraph(body: Record<string, unknown>): Graph {
    const graphSource = isPlainObject(body.graph)
        ? body.graph
        : body;

    const nodes = readNodes(graphSource.nodes);
    const cfg = readConfig(graphSource.cfg) || buildFallbackConfig(graphSource);
    const id = typeof graphSource.id === 'string' && graphSource.id.trim()
        ? graphSource.id.trim()
        : cfg.id;

    return {id, nodes, cfg};
}

function routeErrorResponse(error: unknown) {
    if (error instanceof ApiError) {
        return NextResponse.json({
            success: false,
            error: error.message,
            message: error.message,
        }, {status: error.status});
    }

    console.error('校验规则失败', error);

    return NextResponse.json({
        success: false,
        error: '校验规则失败',
        message: error instanceof Error ? error.message : '未知错误',
    }, {status: 500});
}

/**
 * POST /api/graphs/validate
 * 支持 {graph}、{nodes, cfg} 或 {id, name, nodes, enable}。
 */
export async function POST(request: NextRequest) {
    try {
        const body = await readBody(request);
        const graph = buildGraph(body);
        const issues = validateGraph(graph);
        const errors = issues.filter(issue => issue.level === 'error');
        const warnings = issues.filter(issue => issue.level === 'warn');

        return NextResponse.json({
            success: true,
            valid: errors.length === 0,
            errorCount: errors.length,
            warningCount: warnings.length,
            errors,
            warnings,
        });
    } catch (error) {
        return routeErrorResponse(error);
    }
}
