import { hasSiteSession } from '../site/session.mjs';

const MAX_REQUEST_BYTES = 4_000_000;
const MAX_IMAGES = 4;
const MAX_TEXT_LENGTH = 4_000;
const MAX_ITEMS = 40;
const MODEL = 'gemini-3.1-flash-lite';
const NUTRIENTS = ['cal', 'protein', 'carbs', 'fat'];

const MEAL_SCHEMA = {
    type: 'array',
    maxItems: MAX_ITEMS,
    items: {
        type: 'object',
        properties: {
            name: { type: 'string', description: '食物名称与估计分量，例如全麦面包（1 片，约 38 克）' },
            cal: { type: 'number', minimum: 0, description: '热量（千卡）' },
            protein: { type: 'number', minimum: 0, description: '蛋白质（克）' },
            carbs: { type: 'number', minimum: 0, description: '碳水化合物（克）' },
            fat: { type: 'number', minimum: 0, description: '脂肪（克）' }
        },
        required: ['name', ...NUTRIENTS]
    }
};

function errorResponse(status, error, headers) {
    return Response.json({ error }, {
        status,
        headers: { 'Cache-Control': 'no-store', ...headers }
    });
}

export default {
    async fetch(request) {
        if (!hasSiteSession(request)) {
            return errorResponse(401, '请先输入站点密码。');
        }
        if (request.method !== 'POST') {
            return errorResponse(405, '请使用 POST 提交餐食。', { Allow: 'POST' });
        }
        const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (contentType !== 'application/json') {
            return errorResponse(415, '请提交 JSON 格式的餐食数据。');
        }

        const payload = await request.text().catch(() => null);
        if (payload === null) return errorResponse(400, '无法读取餐食数据。');
        if (Buffer.byteLength(payload) > MAX_REQUEST_BYTES) {
            return errorResponse(413, '照片总大小超出限制，请减少图片数量后重试。');
        }

        let body;
        try {
            body = JSON.parse(payload);
        } catch {
            return errorResponse(400, '餐食数据格式不正确。');
        }
        const { text = '', images = [] } = body ?? {};
        if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) {
            return errorResponse(400, '餐食说明最多 4000 个字符。');
        }
        if (!Array.isArray(images) || images.length > MAX_IMAGES || !images.every(data =>
            typeof data === 'string' && data.startsWith('/9j/') && data.length % 4 === 0 &&
            /^[A-Za-z0-9+/]+={0,2}$/.test(data)
        )) {
            return errorResponse(400, '请上传最多 4 张可读取的餐食照片。');
        }
        if (!text.trim() && !images.length) {
            return errorResponse(400, '请输入食物详情或上传餐食照片。');
        }

        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) {
            return errorResponse(503, 'AI 识别尚未配置，请在 Vercel 中设置 GEMINI_API_KEY。');
        }

        try {
            const upstream = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    signal: AbortSignal.timeout(25_000),
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: '根据餐食文字和图片估算食物分量、热量及三大营养素。用简体中文列出可辨识的食物和分量。若同一餐有多张照片，避免重复计算同一食物。无法辨识出食物时返回空数组。' }] },
                        contents: [{
                            role: 'user',
                            parts: [
                                { text: text.trim() || '请根据照片识别这餐的食物。' },
                                ...images.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } }))
                            ]
                        }],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            responseJsonSchema: MEAL_SCHEMA,
                            maxOutputTokens: 4096
                        }
                    })
                }
            );
            if (upstream.status === 429) return errorResponse(429, 'AI 识别额度或频率已达上限，请稍后重试。');
            if (upstream.status === 503) return errorResponse(503, 'AI 服务暂时繁忙，请稍后重试。');
            if (!upstream.ok) return errorResponse(502, 'AI 服务拒绝了请求，请检查 Gemini API 密钥与模型权限。');

            const result = await upstream.json();
            const parts = result.candidates?.[0]?.content?.parts ?? [];
            const items = JSON.parse(parts.filter(part => !part.thought).map(part => part.text).join(''));
            if (!Array.isArray(items) || items.length > MAX_ITEMS || !items.every(item =>
                typeof item?.name === 'string' && item.name.trim() &&
                NUTRIENTS.every(key => Number.isFinite(item[key]) && item[key] >= 0)
            )) {
                return errorResponse(502, 'AI 返回的营养数据格式不正确，请重试。');
            }
            if (!items.length) return errorResponse(422, '没有辨认出食物，请补充分量说明或换一张照片。');
            return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
        } catch (error) {
            if (error.name === 'TimeoutError') return errorResponse(504, 'AI 识别超时，请稍后重试。');
            return errorResponse(502, '暂时无法读取 AI 识别结果，请稍后重试。');
        }
    }
};
