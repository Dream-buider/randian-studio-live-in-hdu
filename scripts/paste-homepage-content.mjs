import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\.pw-edge-profile';
const homeUrl = 'https://scnbcye3xdfz.feishu.cn/wiki/EsamwS4JCinpBWkW1ICcD1H9nPb';

const content = `LIVE IN HDU 是杭州电子科技大学学生生活、学习资料与新生问答共建社区。

从这里开始：

1. 新生生存指南：报到、寝室、快递、食堂、地图、通勤。
2. 学业资料库：高数、线代、大物、程序设计、四六级和课程资料投稿。
3. 选课与培养：选课时间线、通识课、体育课、重修补考缓考、转专业、培养方案。
4. 成长发展：竞赛、实验室、科研、保研、考研、实习就业。
5. 校园生活：社团、活动、杭州生活、租房兼职与安全提醒。
6. 共建社区：投稿入口、内容规范、贡献者、更新日志、反馈纠错。
7. 知识问答与 FAQ：沉淀新生、学业、生活高频问题，为后续接入飞书知识问答做准备。

内容维护规则：

每篇内容建议包含：一句话结论、适用对象、正文、注意事项、资料来源、更新时间、贡献者、可靠等级。

可靠等级：
A：来自学校官方通知或官网。
B：多人验证过的经验。
C：单人经验，仅供参考。

当前阶段：

这是 LIVE IN HDU 的第一版框架。优先补齐新生生存指南和学业资料库，再逐步开放投稿与问答。`;

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

if (await page.getByRole('button', { name: '编辑' }).count()) {
  await page.getByRole('button', { name: '编辑' }).last().click();
  await page.waitForTimeout(1200);
}

await page.mouse.click(580, 250);
await page.waitForTimeout(500);
await page.keyboard.insertText(content);
await page.waitForTimeout(10000);

const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return { title: document.title, url: location.href, bodyText: clean(document.body.innerText).slice(0, 9000) };
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\homepage-content-pasted.png', fullPage: true });
await context.close();
