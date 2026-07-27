import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\.pw-edge-profile';

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});

const page = context.pages()[0] ?? await context.newPage();
await page.goto('https://www.feishu.cn/', { waitUntil: 'domcontentloaded' });
console.log('Edge automation window opened at Feishu. Log in there if needed, then tell Codex.');

process.stdin.resume();
