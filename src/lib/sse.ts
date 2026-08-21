export interface ExtractedSseData {
    data: string[];
    rest: string;
}

/**
 * 从任意大小的网络分片中提取完整 SSE 事件。
 * ReadableStream 的 chunk 边界与 SSE 事件边界没有关系，调用方必须保留 rest。
 */
export function extractSseData(buffer: string, flush = false): ExtractedSseData {
    const data: string[] = [];
    let rest = buffer;
    const separator = /\r?\n\r?\n/;

    while (true) {
        const match = separator.exec(rest);
        if (!match) break;

        const event = rest.slice(0, match.index);
        rest = rest.slice(match.index + match[0].length);
        collectEventData(event, data);
    }

    if (flush && rest.trim()) {
        collectEventData(rest, data);
        rest = '';
    }

    return {data, rest};
}

function collectEventData(event: string, output: string[]): void {
    const lines = event.split(/\r?\n/);
    const fields = lines
        .filter(line => line === 'data:' || line.startsWith('data: '))
        .map(line => line === 'data:' ? '' : line.slice(6));

    if (fields.length > 0) output.push(fields.join('\n'));
}
