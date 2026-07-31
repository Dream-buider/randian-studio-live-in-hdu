export function renderTrialLoginPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <title>LIVE IN HDU 团队内测</title>
  <style>
    :root { font-family: system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; color:#172033; background:#f3f7ff; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:radial-gradient(circle at top,#dce9ff 0,#f6f8fc 48%,#edf3ff 100%); }
    main { width:min(100%,420px); padding:34px 28px; border:1px solid #e2e8f4; border-radius:24px; background:rgba(255,255,255,.96); box-shadow:0 22px 70px rgba(28,63,128,.14); }
    .mark { width:48px; height:48px; display:grid; place-items:center; border-radius:15px; background:#1769e0; color:white; font-weight:800; letter-spacing:.04em; }
    h1 { margin:22px 0 8px; font-size:25px; }
    p { margin:0 0 24px; color:#657087; line-height:1.65; }
    label { display:block; margin-bottom:8px; font-weight:650; }
    input { width:100%; height:50px; padding:0 14px; border:1px solid #cdd7e8; border-radius:12px; font:inherit; outline:none; }
    input:focus { border-color:#1769e0; box-shadow:0 0 0 3px rgba(23,105,224,.12); }
    button { width:100%; height:50px; margin-top:14px; border:0; border-radius:12px; background:#1769e0; color:white; font:inherit; font-weight:700; cursor:pointer; }
    button:disabled { opacity:.65; cursor:wait; }
    #message { min-height:24px; margin:12px 0 0; color:#c0362c; font-size:14px; }
    small { display:block; margin-top:18px; color:#8a94a6; line-height:1.5; }
  </style>
</head>
<body>
  <main>
    <div class="mark">HDU</div>
    <h1>LIVE IN HDU 团队内测</h1>
    <p>请输入团队测试码，进入新生问答体验页面。</p>
    <form id="login-form">
      <label for="code">团队测试码</label>
      <input id="code" name="code" type="password" autocomplete="current-password" required autofocus>
      <button id="submit" type="submit">进入体验</button>
      <div id="message" role="alert" aria-live="polite"></div>
    </form>
    <small>仅供受邀成员测试，请勿转发测试码或公开访问地址。</small>
  </main>
  <script>
    const form = document.getElementById('login-form');
    const button = document.getElementById('submit');
    const message = document.getElementById('message');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      button.disabled = true;
      message.textContent = '';
      try {
        const response = await fetch('/trial/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: document.getElementById('code').value })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || '暂时无法登录，请稍后重试');
        }
        location.replace('/');
      } catch (error) {
        message.textContent = error instanceof Error ? error.message : '暂时无法登录，请稍后重试';
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
