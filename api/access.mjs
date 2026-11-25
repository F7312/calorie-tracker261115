import { readFile } from 'node:fs/promises';
import { correctSitePassword, hasSiteSession, siteAccessConfigured, siteSessionCookie } from '../site/session.mjs';

const loginFile = new URL('../public/login.html', import.meta.url);
const trackerFile = new URL('../site/tracker.html', import.meta.url);
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

async function servePage(request, file, status = 200, message = '') {
    const headers = { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' };
    if (request.method === 'HEAD') return new Response(null, { status, headers });
    const source = await readFile(file, 'utf8');
    const body = message
        ? source.replace('<!-- access-message -->', `<p class="message" role="alert">${message}</p>`)
        : source;
    return new Response(body, { status, headers });
}

function redirectHome(cookie) {
    return new Response(null, {
        status: 303,
        headers: { ...privateHeaders, Location: '/', 'Set-Cookie': cookie }
    });
}

export default {
    async fetch(request) {
        if (!siteAccessConfigured()) {
            return servePage(request, loginFile, 503, '站点密码尚未配置。');
        }
        if (request.method === 'GET' || request.method === 'HEAD') {
            return servePage(request, hasSiteSession(request) ? trackerFile : loginFile);
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', {
                status: 405, headers: { ...privateHeaders, Allow: 'GET, HEAD, POST' }
            });
        }

        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) {
            return new Response('Forbidden', { status: 403, headers: privateHeaders });
        }
        const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (contentType !== 'application/x-www-form-urlencoded') {
            return new Response('Unsupported Media Type', { status: 415, headers: privateHeaders });
        }
        const payload = await request.text().catch(() => null);
        if (payload === null || payload.length > 4096) {
            return servePage(request, loginFile, 400, '无法读取密码，请重试。');
        }
        const form = new URLSearchParams(payload);
        if (form.get('action') === 'logout') {
            return redirectHome(siteSessionCookie(request, true));
        }
        if (!correctSitePassword(form.get('password'))) {
            return servePage(request, loginFile, 401, '密码不正确，请重试。');
        }
        return redirectHome(siteSessionCookie(request));
    }
};
