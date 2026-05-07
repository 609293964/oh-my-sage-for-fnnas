export interface MijiaPasscodeRequestConfig {
    requestUrl: string;
    cookie: string;
    passcodeRequestBody: string;
    accept: string;
    contentType: string;
    userAgent: string;
    connection: string;
    acceptEncoding: string;
    acceptLanguage: string;
    operateCommon: string;
    originFrom: string;
    xiaomiProtocolFlagCli: string;
    miotRequestModel: string;
}

export interface MijiaPasscodeParseResult {
    config: MijiaPasscodeRequestConfig;
    found: boolean;
    matchedRequestCount: number;
    message: string;
    source: 'har' | 'curl' | 'json';
}

interface ParsedCurlRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    data?: string;
}

export const defaultMijiaPasscodeRequestConfig: MijiaPasscodeRequestConfig = {
    requestUrl: '',
    cookie: '',
    passcodeRequestBody: '',
    accept: '*/*',
    contentType: 'application/x-www-form-urlencoded',
    userAgent: '',
    connection: 'keep-alive',
    acceptEncoding: 'gzip, deflate, br',
    acceptLanguage: 'zh-Hans;q=1',
    operateCommon: '',
    originFrom: '',
    xiaomiProtocolFlagCli: '',
    miotRequestModel: 'xiaomi.gateway.hub1',
};

const passcodeKeys = ['passcode', 'passwd', 'password', 'pwd'];

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    return typeof value === 'string' ? value : '';
}

function normalizeConfig(settings: Partial<MijiaPasscodeRequestConfig>): MijiaPasscodeRequestConfig {
    return {
        ...defaultMijiaPasscodeRequestConfig,
        ...Object.fromEntries(
            Object.entries(settings).filter(([, value]) => typeof value === 'string')
        ),
    };
}

function safeDecodeURIComponent(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function detectRequestKind(data: string): 'url' | 'passcode' | '' {
    const decodedData = safeDecodeURIComponent(data || '');
    if (decodedData.includes('miIO.get_autowebconfig_url')) {
        return 'url';
    }
    if (decodedData.includes('miIO.get_central_link_passcode')) {
        return 'passcode';
    }
    return '';
}

function isMijiaUrl(url: string): boolean {
    return url.includes('mijia.tech') || url.includes('api.io.mi.com');
}

function readHarHeader(headers: unknown, targetName: string): string {
    if (!Array.isArray(headers)) return '';
    const targetNameLower = targetName.toLowerCase();
    for (const header of headers) {
        if (!isRecord(header)) continue;
        const name = readString(header, 'name');
        if (name.toLowerCase() === targetNameLower) {
            return readString(header, 'value');
        }
    }
    return '';
}

function readCurlHeader(headers: Record<string, string>, targetName: string): string {
    const targetNameLower = targetName.toLowerCase();
    for (const [headerName, headerValue] of Object.entries(headers)) {
        if (headerName.toLowerCase() === targetNameLower) {
            return headerValue;
        }
    }
    return '';
}

function getHarPostText(postData: unknown): string {
    if (!isRecord(postData)) return '';
    const text = readString(postData, 'text');
    if (text) return text;

    const params = postData.params;
    if (!Array.isArray(params)) return '';

    const searchParams = new URLSearchParams();
    for (const param of params) {
        if (!isRecord(param)) continue;
        const name = readString(param, 'name');
        if (!name) continue;
        searchParams.append(name, readString(param, 'value'));
    }
    return searchParams.toString();
}

function normalizeCurlCommand(command: string): string {
    return command.replace(/\\\r?\n/g, ' ').replace(/\r?\n/g, ' ').trim();
}

function tokenizeShellCommand(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaping = false;

    for (let index = 0; index < command.length; index += 1) {
        const char = command[index];
        if (escaping) {
            current += char;
            escaping = false;
            continue;
        }
        if (inSingleQuote) {
            if (char === "'") inSingleQuote = false;
            else current += char;
            continue;
        }
        if (inDoubleQuote) {
            if (char === '"') {
                inDoubleQuote = false;
                continue;
            }
            if (char === '\\') {
                const nextChar = command[index + 1];
                if (nextChar === '"' || nextChar === '\\' || nextChar === '$' || nextChar === '`') {
                    current += nextChar;
                    index += 1;
                    continue;
                }
            }
            current += char;
            continue;
        }
        if (/\s/.test(char)) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            continue;
        }
        if (char === "'") {
            inSingleQuote = true;
            continue;
        }
        if (char === '"') {
            inDoubleQuote = true;
            continue;
        }
        if (char === '\\') {
            escaping = true;
            continue;
        }
        current += char;
    }

    if (escaping) current += '\\';
    if (current) tokens.push(current);
    return tokens;
}

function parseHeaderLine(headerLine: string, requestHeaders: Record<string, string>): void {
    const separatorIndex = headerLine.indexOf(':');
    if (separatorIndex === -1) return;
    const headerName = headerLine.slice(0, separatorIndex).trim();
    const headerValue = headerLine.slice(separatorIndex + 1).trim();
    if (headerName) {
        requestHeaders[headerName] = headerValue;
    }
}

function readOptionValue(tokens: string[], index: number, optionName: string): string {
    const value = tokens[index + 1];
    if (typeof value === 'undefined') throw new Error(`${optionName} 缺少值`);
    return value;
}

function parseCurlCommand(command: string): ParsedCurlRequest {
    const tokens = tokenizeShellCommand(normalizeCurlCommand(command));
    if (!tokens.length) throw new Error('请先粘贴 CURL 命令');
    if (!/(^|\/)curl(\.exe)?$/i.test(tokens[0])) {
        throw new Error('当前内容不是可识别的 CURL 命令');
    }

    const request: ParsedCurlRequest = {method: 'GET', url: '', headers: {}};
    let hasBody = false;

    for (let index = 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (/^https?:\/\//i.test(token)) {
            request.url = token;
            continue;
        }
        if (token === '-X' || token === '--request') {
            request.method = readOptionValue(tokens, index, token).toUpperCase();
            index += 1;
            continue;
        }
        if (token.startsWith('--request=')) {
            request.method = token.slice('--request='.length).toUpperCase();
            continue;
        }
        if (token === '-H' || token === '--header') {
            parseHeaderLine(readOptionValue(tokens, index, token), request.headers);
            index += 1;
            continue;
        }
        if (token.startsWith('--header=')) {
            parseHeaderLine(token.slice('--header='.length), request.headers);
            continue;
        }
        if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii') {
            request.data = readOptionValue(tokens, index, token);
            hasBody = true;
            index += 1;
            continue;
        }
        if (token.startsWith('--data=') || token.startsWith('--data-raw=') || token.startsWith('--data-binary=') || token.startsWith('--data-ascii=')) {
            request.data = token.slice(token.indexOf('=') + 1);
            hasBody = true;
            continue;
        }
        if (token === '--url') {
            request.url = readOptionValue(tokens, index, token);
            index += 1;
            continue;
        }
        if (token.startsWith('--url=')) {
            request.url = token.slice('--url='.length);
            continue;
        }
        if (token === '-A' || token === '--user-agent') {
            request.headers['User-Agent'] = readOptionValue(tokens, index, token);
            index += 1;
            continue;
        }
        if (token.startsWith('--user-agent=')) {
            request.headers['User-Agent'] = token.slice('--user-agent='.length);
            continue;
        }
        if (token === '-b' || token === '--cookie') {
            request.headers.Cookie = readOptionValue(tokens, index, token);
            index += 1;
            continue;
        }
        if (token.startsWith('--cookie=')) {
            request.headers.Cookie = token.slice('--cookie='.length);
        }
    }

    if (!request.url) throw new Error('未能从 CURL 命令中解析出请求地址');
    if (hasBody && request.method === 'GET') request.method = 'POST';
    return request;
}

function parseCurlToConfig(text: string): MijiaPasscodeParseResult {
    const request = parseCurlCommand(text);
    const requestBody = request.data || '';
    const requestKind = detectRequestKind(requestBody);
    const isRpc = request.url.includes('/app/home/rpc');
    const config = normalizeConfig({
        requestUrl: request.url,
        cookie: readCurlHeader(request.headers, 'Cookie'),
        passcodeRequestBody: requestBody,
        accept: readCurlHeader(request.headers, 'Accept') || defaultMijiaPasscodeRequestConfig.accept,
        contentType: readCurlHeader(request.headers, 'Content-Type') || defaultMijiaPasscodeRequestConfig.contentType,
        userAgent: readCurlHeader(request.headers, 'User-Agent'),
        connection: readCurlHeader(request.headers, 'Connection') || defaultMijiaPasscodeRequestConfig.connection,
        acceptEncoding: readCurlHeader(request.headers, 'Accept-Encoding') || defaultMijiaPasscodeRequestConfig.acceptEncoding,
        acceptLanguage: readCurlHeader(request.headers, 'Accept-Language') || defaultMijiaPasscodeRequestConfig.acceptLanguage,
        operateCommon: readCurlHeader(request.headers, 'operate-common'),
        originFrom: readCurlHeader(request.headers, 'Origin-From'),
        xiaomiProtocolFlagCli: readCurlHeader(request.headers, 'X-XIAOMI-PROTOCAL-FLAG-CLI'),
        miotRequestModel: readCurlHeader(request.headers, 'MIOT-REQUEST-MODEL') || defaultMijiaPasscodeRequestConfig.miotRequestModel,
    });
    const found = isMijiaUrl(request.url) && Boolean(requestBody) && requestKind === 'passcode';

    return {
        config,
        found,
        matchedRequestCount: found ? 1 : 0,
        message: found
            ? '已从 CURL 文本中识别登录码请求参数'
            : isRpc
                ? '已从 CURL 文本中解析 RPC 请求，但未识别到登录码方法'
                : '已从 CURL 文本中识别请求参数',
        source: 'curl',
    };
}

export function parseMijiaPasscodeCaptureText(text: string): MijiaPasscodeParseResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return parseCurlToConfig(text);
    }

    if (!isRecord(parsed)) {
        throw new Error('文件不是有效的 HAR/JSON 结构');
    }

    const log = parsed.log;
    const entries = isRecord(log) ? log.entries : undefined;
    if (!Array.isArray(entries)) {
        throw new Error('解析 JSON 成功，但没有找到标准 HAR 的 log.entries 结构');
    }

    let foundAny = false;
    let foundPasscode = false;
    let matchedRequestCount = 0;
    const nextConfig = {...defaultMijiaPasscodeRequestConfig};

    for (const entry of entries) {
        if (!isRecord(entry) || !isRecord(entry.request)) continue;
        const request = entry.request;
        const url = readString(request, 'url');
        if (!url || !isMijiaUrl(url)) continue;

        foundAny = true;
        nextConfig.cookie = readHarHeader(request.headers, 'Cookie') || nextConfig.cookie;
        nextConfig.accept = readHarHeader(request.headers, 'Accept') || nextConfig.accept;
        nextConfig.contentType = readHarHeader(request.headers, 'Content-Type') || nextConfig.contentType;
        nextConfig.userAgent = readHarHeader(request.headers, 'User-Agent') || nextConfig.userAgent;
        nextConfig.connection = readHarHeader(request.headers, 'Connection') || nextConfig.connection;
        nextConfig.acceptEncoding = readHarHeader(request.headers, 'Accept-Encoding') || nextConfig.acceptEncoding;
        nextConfig.acceptLanguage = readHarHeader(request.headers, 'Accept-Language') || nextConfig.acceptLanguage;
        nextConfig.operateCommon = readHarHeader(request.headers, 'operate-common') || nextConfig.operateCommon;
        nextConfig.originFrom = readHarHeader(request.headers, 'Origin-From') || nextConfig.originFrom;
        nextConfig.xiaomiProtocolFlagCli = readHarHeader(request.headers, 'X-XIAOMI-PROTOCAL-FLAG-CLI') || nextConfig.xiaomiProtocolFlagCli;
        nextConfig.miotRequestModel = readHarHeader(request.headers, 'MIOT-REQUEST-MODEL') || nextConfig.miotRequestModel;

        if (readString(request, 'method').toUpperCase() !== 'POST') continue;
        const postText = getHarPostText(request.postData);
        if (!postText) continue;

        const requestKind = detectRequestKind(postText);
        if (requestKind === 'passcode') {
            foundPasscode = true;
            matchedRequestCount += 1;
            nextConfig.requestUrl = url;
            nextConfig.passcodeRequestBody = postText;
            continue;
        }

        if (!nextConfig.requestUrl) nextConfig.requestUrl = url;
        if (!nextConfig.passcodeRequestBody) nextConfig.passcodeRequestBody = postText;
    }

    return {
        config: normalizeConfig(nextConfig),
        found: foundPasscode,
        matchedRequestCount,
        message: foundPasscode
            ? `成功解析抓包文件，识别到 ${matchedRequestCount} 个登录码请求`
            : foundAny
                ? '提取了小米请求头，但未找到匹配的登录码 RPC 请求'
                : '抓包文件中未找到小米相关请求',
        source: 'har',
    };
}

function extractSixDigitPasscode(value: unknown): string {
    if (value === null || typeof value === 'undefined') return '';
    const match = String(value).match(/\b\d{6}\b/);
    return match ? match[0] : '';
}

export function findMijiaPasscodeValue(value: unknown): string {
    if (value === null || typeof value === 'undefined') return '';

    if (typeof value === 'string' || typeof value === 'number') {
        return extractSixDigitPasscode(value);
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const nestedValue = findMijiaPasscodeValue(item);
            if (nestedValue) return nestedValue;
        }
        return '';
    }

    if (isRecord(value)) {
        for (const key of passcodeKeys) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const directValue = findMijiaPasscodeValue(value[key]);
                if (directValue) return directValue;
            }
        }
        for (const child of Object.values(value)) {
            const nestedValue = findMijiaPasscodeValue(child);
            if (nestedValue) return nestedValue;
        }
    }

    return '';
}

export function normalizeMijiaPasscodeConfig(settings: Partial<MijiaPasscodeRequestConfig>): MijiaPasscodeRequestConfig {
    return normalizeConfig(settings);
}
