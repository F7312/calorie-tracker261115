import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'calorie_tracker_session';
const SESSION_SECONDS = 12 * 60 * 60;

export function siteAccessConfigured() {
    return Boolean(process.env.SITE_PASSWORD && (process.env.SITE_SESSION_SECRET?.length ?? 0) >= 32);
}

export function correctSitePassword(password) {
    if (!siteAccessConfigured() || typeof password !== 'string') return false;
    const digest = value => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(password), digest(process.env.SITE_PASSWORD));
}

function sessionSignature(expires) {
    return createHmac('sha256', process.env.SITE_SESSION_SECRET)
        .update(`calorie-tracker:${expires}:${process.env.SITE_PASSWORD}`)
        .digest('base64url');
}

export function hasSiteSession(request) {
    if (!siteAccessConfigured()) return false;
    const cookie = (request.headers.get('cookie') ?? '').split(';')
        .map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
    const token = cookie?.slice(COOKIE_NAME.length + 1) ?? '';
    const parts = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!parts || Number(parts[1]) <= Math.floor(Date.now() / 1000)) return false;
    const [, expires, signature] = parts;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(sessionSignature(expires)));
}

export function siteSessionCookie(request, clear = false) {
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const value = clear ? '' : `${expires}.${sessionSignature(expires)}`;
    const maxAge = clear ? 0 : SESSION_SECONDS;
    const url = new URL(request.url);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const secure = localHttp ? '' : '; Secure';
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
