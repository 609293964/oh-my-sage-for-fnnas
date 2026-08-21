export function formatAgentError(error: unknown): string {
    if (typeof error === 'string') return error;
    const details = collectErrorDetails(error);
    const topMessage = details.messages[0] || String(error);
    const suffix = [
        ...details.codes.map(code => `code=${code}`),
        ...details.messages.slice(1).map(message => `cause=${message}`),
    ].join('；');

    if (/\bterminated\b/i.test(topMessage)) {
        return [
            '模型 API 流连接被提前关闭（terminated）',
            suffix,
            '通常由模型接口、中转服务或反向代理提前断开 SSE 响应导致',
        ].filter(Boolean).join('；');
    }

    if (/service temporarily unavailable|upstream service.*unavailable|failed after \d+ attempts|\b503\b/i.test(`${topMessage} ${suffix}`)) {
        return [
            '上游模型服务暂时不可用（可能是 HTTP 503）',
            suffix,
            '应用已自动重试；请稍后再试，或检查模型名称、服务商额度和中转接口状态',
        ].filter(Boolean).join('；');
    }

    return [topMessage, suffix].filter(Boolean).join('；');
}

interface ErrorDetails {
    messages: string[];
    codes: string[];
}

function collectErrorDetails(error: unknown): ErrorDetails {
    const messages: string[] = [];
    const codes: string[] = [];
    const visited = new Set<object>();

    const visit = (value: unknown, depth: number): void => {
        if (depth > 4 || value === null || value === undefined) return;
        if (typeof value === 'string') {
            const decoded = decodeHtmlEntities(value);
            if (decoded && !messages.includes(decoded)) messages.push(decoded);
            return;
        }
        if (typeof value !== 'object' || visited.has(value)) return;
        visited.add(value);

        const candidate = value as {
            name?: unknown;
            message?: unknown;
            error?: unknown;
            code?: unknown;
            status?: unknown;
            statusCode?: unknown;
            cause?: unknown;
        };
        const message = typeof candidate.message === 'string'
            ? candidate.message
            : typeof candidate.error === 'string' ? candidate.error : undefined;
        if (message) {
            const decoded = decodeHtmlEntities(message);
            if (decoded && !messages.includes(decoded)) messages.push(decoded);
        }

        for (const code of [candidate.code, candidate.statusCode, candidate.status]) {
            if ((typeof code === 'string' || typeof code === 'number') && !codes.includes(String(code))) {
                codes.push(String(code));
            }
        }
        visit(candidate.cause, depth + 1);
    };

    visit(error, 0);
    return {messages, codes};
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&#x20;/gi, ' ')
        .replace(/&#32;/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .trim();
}

/** 避免把大段内部参考资料写入会话和浏览器，只保留可诊断摘要。 */
export function compactToolResult(tool: string, result: any): any {
    if (tool !== 'read_skill_file' || typeof result?.content !== 'string') return result;

    const {content, ...summary} = result;
    return {
        ...summary,
        contentLength: content.length,
        message: `Skill 文件读取成功（${content.length} 字符）`,
    };
}
