import http from 'node:http';

export class WebBridgeClient {
  constructor({ session, host = '127.0.0.1', port = 10086, timeoutMs = 180000 }) {
    this.session = session;
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  command(action, args = {}) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ action, args, session: this.session });
      const request = http.request({
        hostname: this.host,
        port: this.port,
        path: '/command',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      }, (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { text += chunk; });
        response.on('end', () => {
          try {
            const payload = JSON.parse(text);
            if (!payload.ok) reject(new Error(`${action}: ${payload.error?.message || text}`));
            else resolve(payload.data);
          } catch (error) {
            reject(error);
          }
        });
      });
      request.setTimeout(this.timeoutMs, () => request.destroy(new Error(`${action} timed out after ${this.timeoutMs}ms`)));
      request.on('error', reject);
      request.end(body);
    });
  }

  async evaluate(code) {
    const result = await this.command('evaluate', { code });
    return result.value;
  }

  async evaluateAsync(expression) {
    const result = await this.command('cdp', {
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed.');
    }
    return result.result?.value;
  }

  async navigate(url, { newTab = false, groupTitle } = {}) {
    return this.command('navigate', { url, newTab, ...(groupTitle ? { group_title: groupTitle } : {}) });
  }

  async wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
