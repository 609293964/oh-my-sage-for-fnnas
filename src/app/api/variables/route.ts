import {NextRequest, NextResponse} from 'next/server';
import {createVariable, deleteVariable, getVariableConfig, getVariables, getVariableValue, setVariable} from '@/core';
import {getGateway, isGatewayConnected} from '@/server/gateway/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    if (!isGatewayConnected()) return NextResponse.json({success: false, error: '未连接到网关'}, {status: 400});
    const gateway = getGateway()!;
    const {searchParams} = new URL(request.url);
    const scope = searchParams.get('scope') || 'global';
    const id = searchParams.get('id');
    const view = searchParams.get('view');
    const result = id
        ? view === 'config' ? await getVariableConfig(gateway, id, scope) : await getVariableValue(gateway, id, scope)
        : await getVariables(gateway, scope);
    return NextResponse.json(result, {status: result.success ? 200 : 502});
}

export async function POST(request: NextRequest) {
    if (!isGatewayConnected()) return NextResponse.json({success: false, error: '未连接到网关'}, {status: 400});
    const gateway = getGateway()!;
    const {id, type, value, name, scope = 'global'} = await request.json();
    if (!/^[a-zA-Z0-9]+$/.test(id || '') || !['number', 'string'].includes(type) || typeof value !== type) {
        return NextResponse.json({success: false, error: '变量参数无效'}, {status: 400});
    }
    const result = await createVariable(gateway, id, type, value, name, scope);
    return NextResponse.json(result, {status: result.success ? 201 : 502});
}

export async function PATCH(request: NextRequest) {
    if (!isGatewayConnected()) return NextResponse.json({success: false, error: '未连接到网关'}, {status: 400});
    const gateway = getGateway()!;
    const {id, value, scope = 'global'} = await request.json();
    if (typeof id !== 'string' || !['number', 'string'].includes(typeof value)) return NextResponse.json({success: false, error: '变量参数无效'}, {status: 400});
    const result = await setVariable(gateway, id, value, scope);
    return NextResponse.json(result, {status: result.success ? 200 : 502});
}

export async function DELETE(request: NextRequest) {
    if (!isGatewayConnected()) return NextResponse.json({success: false, error: '未连接到网关'}, {status: 400});
    const gateway = getGateway()!;
    const {searchParams} = new URL(request.url);
    const id = searchParams.get('id');
    const scope = searchParams.get('scope') || 'global';
    if (!id) return NextResponse.json({success: false, error: '缺少变量 ID'}, {status: 400});
    const result = await deleteVariable(gateway, id, scope);
    const status = result.success ? 200 : /仍被规则引用/.test(result.error) ? 409 : 502;
    return NextResponse.json(result, {status});
}
