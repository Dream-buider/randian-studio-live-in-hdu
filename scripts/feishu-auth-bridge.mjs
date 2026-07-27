export function normalizeCdpCookies(cookies) {
  return cookies
    .filter((cookie) => /(?:^|\.)feishu\.cn$/.test(cookie.domain.replace(/^\./, '')))
    .map((cookie) => {
      const normalized = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        httpOnly: Boolean(cookie.httpOnly),
        secure: Boolean(cookie.secure),
      };
      if (['Strict', 'Lax', 'None'].includes(cookie.sameSite)) normalized.sameSite = cookie.sameSite;
      if (!cookie.session && Number.isFinite(cookie.expires) && cookie.expires > 0) normalized.expires = cookie.expires;
      return normalized;
    });
}

export async function importWebbridgeFeishuCookies({ client, context }) {
  const result = await client.command('cdp', { method: 'Network.getAllCookies', params: {} });
  const cookies = normalizeCdpCookies(result.cookies || []);
  if (!cookies.some((cookie) => cookie.name === 'session' && cookie.httpOnly)) {
    throw new Error('Authenticated Feishu HttpOnly session cookie was not found in the real browser.');
  }
  await context.addCookies(cookies);
  return {
    cookieCount: cookies.length,
    httpOnlyCount: cookies.filter((cookie) => cookie.httpOnly).length,
  };
}
