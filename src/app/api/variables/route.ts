import {NextRequest, NextResponse} from 'next/server';
import {createVariable, deleteVariable, getVariableConfig, getVariables, getVariableValue, setVariable} from '@/core';
import {getGateway, isGatewayConnected} from '@/server/gateway/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function gatewayOrResponse() {
    return isGatewayConnected() ? getGateway()! : NextResponse.json({success: false, error: '未连接到网关'}, {status: 400});
}

export async function GET(request: NextRequest) {
    const gateway = gatewayOrResponse();
    if (gateway instanceof NextResponse) return gateway;
    const {searchParams} = new URL(request.url);
    const scope = searchParams.get('scope') || 'global';
    const id = searchParams.get('id');
    const view = searchParams.get('view');
    const result = id
        ? view === 'config' ? await getVariableConfig(gateway, id, scope) : await getVariableValue(gateway, id, scope)
        : await getVariables(gateway, scope);
    return NextResponse.json(result, {status: result.success ? 200 : 400});
}

export async function POST(request: NextRequest) {
    const gateway = gatewayOrResponse();
    if (gateway instanceof NextResponse) return gateway;
    const {id, type, value, name, scope = 'global'} = await request.json();
    if (!/^[a-zA-Z0-9]+$/.test(id || '') || !['number', 'string'].includes(type) || typeof value !== type) {
        return NextResponse.json({success: false, error: '变量参数无效'}, {status: 400});
    }
    const result = await createVariable(gateway, id, type, value, name, scope);
    return NextResponse.json(result, {status: result.success ? 201 : 400});
}

export async function PATCH(request: NextRequest) {
    const gateway = gatewayOrResponse();
    if (gateway instanceof NextResponse) return gateway;
    const {id, value, scope = 'global'} = await request.json();
    if (typeof id !== 'string' || !['number', 'string'].includes(typeof value)) return NextResponse.json({success: false, error: '变量参数无效'}, {status: 400});
    const result = await setVariable(gateway, id, value, scope);
    return NextResponse.json(result, {status: result.success ? 200 : 400});
}

export async function DELETE(request: NextRequest) {
    const gateway = gatewayOrResponse();
    if (gateway instanceof NextResponse) return gateway;
    const {searchParams} = new URL(request.url);
    const id = searchParams.get('id');
    const scope = searchParams.get('scope') || 'global';
    if (!id) return NextResponse.json({success: false, error: '缺少变量 ID'}, {status: 400});
    const result = await deleteVariable(gateway, id, scope);
    return NextResponse.json(result, {status: result.success ? 200 : 400});
}
