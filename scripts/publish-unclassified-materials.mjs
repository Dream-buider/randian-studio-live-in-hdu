import path from 'node:path';
import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(process.cwd(), '.pw-edge-profile');
const sourceDir = path.join(process.cwd(), '所有的文件（未分类版本）');
const origin = 'https://scnbcye3xdfz.feishu.cn';
const originUrl = `${origin}/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc`;
const spaceId = '7639362813286190049';
const pageFilter = process.env.PAGE_FILTER || '';

const parents = {
  courseReview: 'EdTqwwPDwiuNuwkJjUecYCB5ncf',
  exams: 'Ijh8wkBOLivD6ckyF9mclS7in1b',
  math: 'V2umw0s4diCjhEk3RBhcoyTdn07',
  majorChange: 'IxyqwU84Di3mGgkJnMRcRl6jnig',
  trainingPlan: 'HC1iwI8G8ixT24kHbaUcnxTlnGe',
  research: 'DueQwOWkqiCYkmkF79VcGeKVn3d',
  competition: 'Yw6XwdqUIizxtsk5DDJc2vZXnQc',
  postgraduateRecommendation: 'ShOlwYzn1ievlckpjmmchn2KnHl',
  certificates: 'NcwzwrkN9iHECBk1uRhc9nILnEh',
};

const pages = [
  {
    parent: parents.exams,
    title: '高数期中卷 | 2014-2020',
    audience: '正在复习高等数学 A/B/D 的同学',
    description: '高数期中早期资料卷册，按年份集中查看基础题型与参考答案。',
    note: '试卷与答案仅作复习参考；课程范围、考试安排和标准答案请以任课教师及学院通知为准。',
    sections: [
      {
        title: '本册附件',
        description: '早期资料与 A/B 卷整理，便于先做基础题型训练。',
        files: [
          '高数（D）1期中练习2014.11.doc',
          '2015.11杭电高数上A期中试题及答案.pdf',
          '2018.11杭电高数上A期中试题及答案.pdf',
          '2018.11杭电高数上B期中试题及答案（4题答案更正为C. 15题答案更正为-0.125）.pdf',
          '2019.11杭电高数上期中（AB同卷）试题及答案.pdf',
          '2020.11杭电高数上期中B试题及答案.pdf',
        ],
      },
    ],
  },
  {
    parent: parents.exams,
    title: '高数期中卷 | 2021-2022',
    audience: '正在复习高等数学 A/B/D 的同学',
    description: '高数近期中卷册，收录 2021 至 2022 年试题与可用答案。',
    note: '试卷与答案仅作复习参考；课程范围、考试安排和标准答案请以任课教师及学院通知为准。',
    sections: [
      {
        title: '本册附件',
        description: '可按 A、B、D 类型选择对应卷面进行训练。',
        files: [
          '2021.11杭电高数上期中A试题及答案.pdf',
          '2021.11杭电高数上期中B试题及答案.pdf',
          '2021.11杭电高数D期中试题.pdf',
          '2022.11杭电高数上期中A试题及答案.pdf',
        ],
      },
    ],
  },
  {
    parent: parents.exams,
    title: '高数期中卷 | 2023回忆版',
    audience: '正在复习高等数学 A1/B1 的同学',
    description: '将 2023 年回忆空白卷与解析版成对收录，适合先练后核对。',
    note: '回忆版不等同于官方试卷，题目与解析仅作复习参考。',
    sections: [
      {
        title: 'A1 与 B1 回忆卷',
        description: '建议先打开空白卷自测，再查看相应解析。',
        files: [
          '2023年「高等数学A1」期中空白(回忆版).pdf',
          '2023年「高等数学A1」期中解析(回忆版).pdf',
          '2023年「高等数学B1」期中回忆空白.pdf',
          '2023年「高等数学B1」期中回忆解析.pdf',
        ],
      },
    ],
  },
  {
    parent: parents.exams,
    title: '高数期末卷 | 2014-2018',
    audience: '正在复习高等数学 A/B 的同学',
    description: '高数期末早期卷册，按年份归档 A/B 卷与可用答案。',
    note: '试卷与答案仅作复习参考；课程范围、考试安排和标准答案请以任课教师及学院通知为准。',
    sections: [
      {
        title: '本册附件',
        description: '较早期的期末 A/B 卷与答案。',
        files: [
          '2014.1杭电高数上期末A及参考答案.pdf',
          '2015.1杭电高数上A期末试题及答案.pdf',
          '2016.1杭电高数上A期末试题.pdf',
          '2016.1杭电高数上B期末试题.pdf',
          '2018.1杭电高数上A期末试题及答案.pdf',
        ],
      },
    ],
  },
  {
    parent: parents.exams,
    title: '高数期末卷 | 2021-2024',
    audience: '正在复习高等数学 A1/B1 的同学',
    description: '高数期末近期卷册，收录部分答案、解析与回忆版材料。',
    note: '回忆版及部分答案仅作复习参考；请以任课教师及学院发布的信息为准。',
    sections: [
      {
        title: '本册附件',
        description: '近期题目含部分答案、解析和回忆版。',
        files: [
          '2021.1杭电高数上A期末试题及部分答案.pdf',
          '2021.1杭电高数上B期末试题.pdf',
          '2021年1月杭州电子科技大学高数A期末试题解析.pdf',
          '2024.1杭州电子科技大学高等数学A1期末试题回忆版.pdf',
          '2024.1杭州电子科技大学高等数学B1期末试题回忆版.pdf',
        ],
      },
    ],
  },
  {
    parent: parents.math,
    title: '数学学习参考',
    audience: '希望规划数学基础课程学习路径的同学',
    description: '收录可辅助制定修课与自学计划的数学参考资料。',
    note: '外校修课经验可借鉴学习思路，不等同于杭电培养方案或选课规则。',
    sections: [
      {
        title: '学习路径参考',
        description: '适合在选课或规划数学能力培养方向时阅读。',
        files: ['USTC基础数学修课指南.pdf'],
      },
    ],
  },
  {
    parent: parents.courseReview,
    title: '改革开放史课程资料',
    audience: '正在修读相关思政课程的同学',
    description: '按具体课程归档课堂展示或复习材料，便于课程复习页面继续扩充。',
    note: '课堂材料仅供交流学习，作业与展示要求请以当学期教师要求为准。',
    sections: [
      {
        title: '课程展示材料',
        description: '当前收录 2025-2026 学年第 2 学期资料。',
        files: ['改革开放史-2025-2026-2 -  （1） - 副本.ppt'],
      },
    ],
  },
  {
    parent: parents.majorChange,
    title: '2025级转专业细则',
    audience: '考虑普通类转专业的 2025 级本科生',
    description: '集中收录转入实施细则，便于在转专业入口直接找到对应届别文件。',
    note: '转专业为时效性政策，请在申请前再次核对教务处或学院发布的正式通知与截止时间。',
    sections: [
      {
        title: '实施细则',
        description: 'Excel 附件可下载查看各专业要求。',
        files: ['2025级本科生普通类转专业（类）转入实施细则(1).xlsx'],
      },
    ],
  },
  {
    parent: parents.trainingPlan,
    title: '卓越学院2025级培养方案',
    audience: '卓越学院 2025 级学生及拟了解培养路径的同学',
    description: '按学院和届别归档培养方案，便于安排课程与学分计划。',
    note: '课程安排与毕业审核以学院最新正式版本和教务系统为准。',
    sections: [
      {
        title: '培养方案原文件',
        description: '原始 PDF 文件。',
        files: ['15-卓越学院2025级培养方案(2).pdf'],
      },
    ],
  },
  {
    parent: parents.postgraduateRecommendation,
    title: '2026届推免材料',
    audience: '准备推免申请或核对流程材料的同学',
    description: '把实施办法、拟推荐名单及填写表格归入同一页面，避免申请材料散落。',
    note: '推免政策、名额与提交节点可能更新，必须以学校和学院当年正式通知为准。',
    sections: [
      {
        title: '政策与名单',
        description: '用于了解实施依据与公布信息。',
        files: [
          '附件1：关于印发《杭州电子科技大学推荐优秀应届本科毕业生免试攻读研究生实施办法》的通知（杭电教[2021]131号）.pdf',
          '附件1：2026年拟推荐免试攻读硕士研究生名单.pdf',
        ],
      },
      {
        title: '申请表格',
        description: '提交前请以最新通知为准，确认表格版本。',
        files: [
          '附件3：推免生申请表（2026年修改）.docx',
          '附件4：推免生诚信承诺书（2026修改版）.docx',
          '附件5：推免生思想政治品德考核表.docx',
        ],
      },
    ],
  },
  {
    parent: parents.competition,
    title: '竞赛政策与赛事通知',
    audience: '准备参加学科竞赛或创新赛事的同学',
    description: '把奖励政策和具体赛道通知分别归档在竞赛入口下。',
    note: '赛事命题和奖励政策均有时效性，报名与认定前请查看最新官方发布。',
    sections: [
      {
        title: '竞赛奖励政策',
        description: '用于初步了解竞赛奖励与认定方向。',
        files: ['杭电学科竞赛奖励政策介绍2024-12-5.pdf'],
      },
      {
        title: '2026 创新大赛机器人赛道',
        description: '重复副本已去除，仅保留一份命题说明。',
        files: ['浙江省国际大学生创新大赛（2026）机器人赛道命题说明(3).docx'],
      },
    ],
  },
  {
    parent: parents.research,
    title: '学术评价政策',
    audience: '开始科研、发表论文或准备成果认定的同学',
    description: '归档与科研评价相关的正式目录和说明，便于科研入门阶段查询。',
    note: '目录版本可能调整，成果认定前须向学院或学校科研管理部门复核。',
    sections: [
      {
        title: '期刊与出版社分级名录',
        description: '当前收录 2023 版通知原文件。',
        files: ['关于印发杭州电子科技大学国内学术期刊和专业出版社分级名录（2023版）的通知（ 杭电科〔2023〕96号）.pdf'],
      },
    ],
  },
  {
    parent: parents.certificates,
    title: '雅思备考资料',
    audience: '准备雅思听力考试的同学',
    description: '证书考试栏目下的专项备考材料，后续可继续按考试类型扩展。',
    note: '本页为学习资料归档，不涉及报名、成绩或留学政策说明。',
    sections: [
      {
        title: '听力词汇',
        description: '场景词汇速览资料。',
        files: ['雅思听力场景词汇15页.pdf'],
      },
    ],
  },
];

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function allFiles(spec) {
  return spec.sections.flatMap((section) => section.files);
}

async function fetchTree(page, token) {
  return page.evaluate(async (wikiToken) => {
    const url = `/space/api/wiki/v2/tree/get_info/?wiki_token=${wikiToken}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=true`;
    const response = await fetch(url, { credentials: 'include' });
    return response.json();
  }, token);
}

async function ensurePage(page, csrf, spec) {
  let treeData = await fetchTree(page, spec.parent);
  const children = treeData.data.tree.child_map[spec.parent] || [];
  let node = children
    .map((token) => treeData.data.tree.nodes[token])
    .find((child) => child?.title === spec.title);
  if (node) return { node, created: false };

  const result = await page.evaluate(async ({ spaceId, parent, title, csrf }) => {
    const response = await fetch('/space/api/wiki/v2/tree/create_node/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrf,
        'docs-host-id': parent,
        'docs-host-type': 'Wiki',
        'doc-platform': 'web',
        'x-lsc-terminal': 'web',
      },
      body: JSON.stringify({
        space_id: spaceId,
        parent_wiki_token: parent,
        ua_type: 'Web',
        scene: 'wiki_create',
        obj_type: 22,
        node_type: 0,
        synergy_uuid: String(Date.now()),
        template_token: '',
        title,
      }),
    });
    return { status: response.status, text: await response.text() };
  }, { spaceId, parent: spec.parent, title: spec.title, csrf });
  if (result.status >= 300) {
    throw new Error(`Cannot create page ${spec.title}: ${result.status} ${result.text}`);
  }

  await page.waitForTimeout(800);
  treeData = await fetchTree(page, spec.parent);
  node = (treeData.data.tree.child_map[spec.parent] || [])
    .map((token) => treeData.data.tree.nodes[token])
    .find((child) => child?.title === spec.title);
  if (!node) throw new Error(`Created page is missing from tree: ${spec.title}`);
  return { node, created: true };
}

async function setClipboard(page, plain, html) {
  await page.evaluate(async ({ plain, html }) => {
    const item = new ClipboardItem({
      'text/plain': new Blob([plain], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    });
    await navigator.clipboard.write([item]);
  }, { plain, html });
}

async function moveToEnd(page, { append = true } = {}) {
  const editors = page.locator('.zone-container.text-editor');
  const count = await editors.count();
  if (count < 1) throw new Error('Cannot locate a writable document body.');
  const placeholder = page.getByText('输入“/”快速插入内容', { exact: false }).last();
  if (count === 1 && await placeholder.count() && await placeholder.isVisible()) {
    const box = await placeholder.boundingBox();
    if (!box) throw new Error('Cannot locate the empty document body placeholder.');
    await page.mouse.click(box.x + 16, box.y + box.height / 2);
    await page.waitForTimeout(400);
    return;
  }
  await editors.last().click({ position: { x: 32, y: 12 } });
  await page.keyboard.press('Control+End');
  if (append) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
  }
}

async function appendRich(page, plain, html) {
  await moveToEnd(page);
  await setClipboard(page, plain, html);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(2500);
}

async function uploadFiles(page, filenames) {
  const filePaths = filenames.map((filename) => path.join(sourceDir, filename));
  await moveToEnd(page);
  await page.keyboard.type('/', { delay: 100 });
  await page.waitForTimeout(1000);
  const menuItem = page.getByText('视频或文件', { exact: true }).last();
  await menuItem.waitFor({ state: 'visible', timeout: 10000 });
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
  await menuItem.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePaths);

  const waitMs = Math.max(7000, Math.min(50000, 3500 + filenames.length * 2500));
  await page.waitForTimeout(waitMs);
  return filenames;
}

async function readBodyText(page) {
  return clean(await page.locator('body').innerText());
}

function normalizeFileLabel(text) {
  return clean(text).replaceAll(/\s+/g, '').replace(/\d+\.\d+MB$/, '');
}

async function readAttachmentLabels(page) {
  const scrollState = await page.evaluate(() => {
    const container = document.querySelector('.bear-web-x-container');
    return container
      ? { top: container.scrollTop, height: container.scrollHeight, viewport: container.clientHeight }
      : { top: 0, height: 0, viewport: 800 };
  });
  const labels = new Set();
  const step = Math.max(420, Math.floor(scrollState.viewport * 0.65));
  for (let top = 0; top <= scrollState.height + step; top += step) {
    await page.evaluate((value) => {
      const container = document.querySelector('.bear-web-x-container');
      if (container) container.scrollTop = value;
    }, top);
    await page.waitForTimeout(220);
    const visible = await page.locator('.docx-file-block').evaluateAll((blocks) => (
      blocks.map((block) => (block.innerText || '').replace(/\u200b/g, '').trim())
    ));
    for (const label of visible) labels.add(normalizeFileLabel(label));
  }
  await page.evaluate((value) => {
    const container = document.querySelector('.bear-web-x-container');
    if (container) container.scrollTop = value;
  }, scrollState.top);
  return labels;
}

function includesAttachment(labels, filename) {
  const expected = normalizeFileLabel(filename);
  return [...labels].some((label) => label.includes(expected));
}

async function publishPage(page, csrf, spec) {
  const ensured = await ensurePage(page, csrf, spec);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5500);

  let text = await readBodyText(page);
  const headerMarker = `本页收录于 2026-05-25`;
  if (!text.includes(headerMarker)) {
    const plain = `资料说明\n${spec.description}\n\n适合查看：${spec.audience}\n\n${spec.note}\n\n本页收录于 2026-05-25，经重复文件检查后整理发布。`;
    const html = `
      <h1>资料说明</h1>
      <p>${escapeHtml(spec.description)}</p>
      <blockquote><strong>适合查看：</strong>${escapeHtml(spec.audience)}</blockquote>
      <blockquote><strong>使用前请注意：</strong>${escapeHtml(spec.note)}</blockquote>
      <p><strong>整理记录：</strong>本页收录于 2026-05-25，经重复文件检查后整理发布。</p>`;
    await appendRich(page, plain, html);
    text = await readBodyText(page);
  }

  const uploaded = [];
  const skipped = [];
  let attachmentLabels = await readAttachmentLabels(page);
  for (const section of spec.sections) {
    const missing = section.files.filter((filename) => !includesAttachment(attachmentLabels, filename));
    if (missing.length === 0) {
      skipped.push(...section.files);
      continue;
    }
    if (!text.includes(section.title)) {
      const plain = `${section.title}\n${section.description}`;
      const html = `<h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description)}</p>`;
      await appendRich(page, plain, html);
    }
    await uploadFiles(page, missing);
    uploaded.push(...missing);
    text = await readBodyText(page);
    attachmentLabels = await readAttachmentLabels(page);
  }

  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  const finalAttachmentLabels = await readAttachmentLabels(page);
  const missingAfterUpload = allFiles(spec).filter((filename) => !includesAttachment(finalAttachmentLabels, filename));
  const screenshotTitle = spec.title.replace(/[<>:"/\\|?*]/g, '-');
  await page.screenshot({
    path: path.join(process.cwd(), `resources-${screenshotTitle}.png`),
    fullPage: true,
  });
  return {
    title: spec.title,
    url,
    token: ensured.node.wiki_token,
    created: ensured.created,
    uploaded,
    skipped,
    missingAfterUpload,
  };
}

const specs = pageFilter ? pages.filter((page) => page.title.includes(pageFilter)) : pages;
if (specs.length === 0) throw new Error(`No page matched PAGE_FILTER=${pageFilter}`);

const expectedFiles = specs.flatMap(allFiles);
for (const filename of expectedFiles) {
  const fullPath = path.join(sourceDir, filename);
  const exists = await import('node:fs').then(({ existsSync }) => existsSync(fullPath));
  if (!exists) throw new Error(`Source file does not exist: ${fullPath}`);
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 900 },
  args: ['--start-maximized'],
});

await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = context.pages()[0] ?? await context.newPage();
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const csrf = (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
if (!csrf) throw new Error('Missing Feishu CSRF token; please confirm the saved browser profile is signed in.');

const results = [];
for (const spec of specs) {
  console.log(`Publishing ${spec.title} (${allFiles(spec).length} files)...`);
  results.push(await publishPage(page, csrf, spec));
}

console.log(JSON.stringify({
  pageCount: results.length,
  expectedFileCount: expectedFiles.length,
  uploadedFileCount: results.flatMap((result) => result.uploaded).length,
  missingFileCount: results.flatMap((result) => result.missingAfterUpload).length,
  results,
}, null, 2));

await context.close();
