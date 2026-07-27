import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(root, '.pw-edge-profile');
const sourceDir = path.join(root, '第二次要更新的文件');
const reportDir = path.join(root, 'docs', '第二次资料发布_2026-05-31');
const origin = 'https://scnbcye3xdfz.feishu.cn';
const originUrl = `${origin}/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc`;
const spaceId = '7639362813286190049';
const publishDate = '2026-05-31';
const pageFilter = process.env.PAGE_FILTER || '';

const parentDefs = {
  electives: { token: 'AHNcw3RRPijtvkkOfnkcWoclnLd' },
  career: { token: 'Xw2EwFV74inAGtkiyl7cQk0lnFc' },
  courseReview: { token: 'EdTqwwPDwiuNuwkJjUecYCB5ncf' },
  assignments: { token: 'MxkhwE7LeiVHpUkz0SNcertHnpc' },
  generalCourses: { token: 'WkdvwmA0ziqpvYkS54CcfjuBnb1' },
  trainingPlan: { token: 'HC1iwI8G8ixT24kHbaUcnxTlnGe' },
  majorChange: { token: 'IxyqwU84Di3mGgkJnMRcRl6jnig' },
  pe: { token: 'L132wa25kiQm6LkunfQcQUHNnAg' },
  reportPrep: { token: 'ZdEjw1OkuiTD1ikCJiacz8RUntf' },
  dorm: { token: 'EnR4wxqLaiSQe3k7mkKc8aQsn1b' },
  mapTransit: { token: 'Jez1w79iUiH53xkWzytcBUHqnch' },
  innovation: { token: 'GktfwoSkuiD0T6kDq9acOMDen8c' },
  competition: { token: 'Yw6XwdqUIizxtsk5DDJc2vZXnQc' },
  degree: {
    parentKey: 'electives',
    title: '毕业与学位',
    introTitle: '毕业与学位',
    introText: '集中归档毕业审核、学位申请、论文提交流程等临近毕业阶段常用资料。',
  },
  awards: {
    parentKey: 'career',
    title: '奖助与评优',
    introTitle: '奖助与评优',
    introText: '集中归档综合测评、评奖评优与荣誉认定等时效性政策资料。',
  },
  studentAffairs: {
    parentKey: 'career',
    title: '党团与实践',
    introTitle: '党团与实践',
    introText: '集中归档党校培训、社会实践与成长发展相关通知，方便按主题继续补充。',
  },
};

const pages = [
  {
    parentKey: 'trainingPlan',
    title: '2025级培养方案 | 信息与工科',
    audience: '电子信息、通信、集成电路、计算机等方向的 2025 级同学',
    description: '集中归档信息与工科方向培养方案，便于对照课程结构、学分安排和专业培养路径。',
    note: '培养方案与毕业要求可能更新，选课、学分审核和毕业资格以学院最新正式版本及教务系统为准。',
    sections: [
      {
        title: '培养方案原文件',
        description: '按专业或学院下载对应文件，核对课程安排与培养要求。',
        files: [
          '2025电子信息类（电子信息学院）.pdf',
          '2025级通信工程学院培养方案（含通信、信抗、新工科、二学位）(1)(1).pdf',
          '2025集成电路设计与集成系统.pdf',
          '4-计算机学院(1).pdf',
        ],
      },
    ],
  },
  {
    parentKey: 'trainingPlan',
    title: '2025级培养方案 | 经管类',
    audience: '数字经济、金融学及相关复合培养方向的 2025 级同学',
    description: '集中归档经管类与复合培养方向的培养方案，方便对照课程与学位要求。',
    note: '双学位、二学位与专业方案的课程结构可能不同，执行时请以学院正式发布版本为准。',
    sections: [
      {
        title: '培养方案原文件',
        description: '覆盖数字经济、金融学、双学士学位与二学位方向。',
        files: [
          '2数字经济专业培养方案.pdf',
          '3金融学（CFA）专业培养方案.pdf',
          '4金融学专业培养方案.pdf',
          '5金融数据科学（金融学+计算机科学与技术）双学士学位专业培养方案.pdf',
          '6金融学二学位专业培养方案.pdf',
        ],
      },
    ],
  },
  {
    parentKey: 'trainingPlan',
    title: '2025级培养方案 | 人文与外语',
    audience: '人艺数法学院、法学与英语专业相关同学',
    description: '集中归档人文与外语方向的培养方案与教学进程，便于确认课程节奏和毕业要求。',
    note: '教学进程表与培养方案可能后续调整，修课安排请同步核对学院通知和教务系统。',
    sections: [
      {
        title: '培养方案与教学进程',
        description: '当前收录法学相关培养方案与英语专业教学进程表。',
        files: [
          '13-人文艺术与数字媒体学院法学院(1).pdf',
          '8-1-1-2025级英语专业教学进程计划表20251103.xlsx',
        ],
      },
    ],
  },
  {
    parentKey: 'generalCourses',
    title: '大学英语课程修读与免修',
    audience: '准备修读大学英语课程或申请免修的本科生',
    description: '集中归档大学英语课程修读办法和当前学期免修申请通知。',
    note: '免修资格、办理时间和所需材料均有时效性，请在提交前再次核对学校正式通知。',
    sections: [
      {
        title: '政策与通知',
        description: '先读修读管理办法，再按当学期通知准备免修申请。',
        files: [
          '附件1：关于印发《杭州电子科技大学本科生大学英语课程修读管理办法（试行）》的通知 (杭电教〔2024〕155号)(1).pdf',
          '关于开展2025-2026学年第二学期本科生大学英语免修申请工作的通知(1).pdf',
        ],
      },
    ],
  },
  {
    parentKey: 'generalCourses',
    title: '劳动教育课程管理办法',
    audience: '需要了解本科劳动教育课程要求的同学',
    description: '归档劳动教育课程管理办法原文件，便于核对课程要求与学分管理规则。',
    note: '制度解释与执行细节以学校当年最新通知和教务口径为准。',
    sections: [
      {
        title: '制度原文',
        description: '建议结合学生手册和学院执行通知一起查看。',
        files: [
          '1_151 关于印发《杭州电子科技大学本科学生劳动教育课程管理办法》的通知 （杭电教〔2023〕151号）.pdf',
        ],
      },
    ],
  },
  {
    parentKey: 'majorChange',
    title: '2025-2026-2 转专业申请',
    audience: '计划在 2025-2026 学年第二学期申请转专业的本科生',
    description: '集中归档本学期转专业工作通知与配套说明文件。',
    note: '转专业名额、资格条件、材料要求和时间节点均以当学期学校及学院正式通知为准。',
    sections: [
      {
        title: '申请通知与材料',
        description: '压缩包与说明文档请下载后查看完整内容。',
        files: [
          '关于2025-2026学年第二学期学生转专业工作的通知(1).rar',
          '转专业.docx',
        ],
      },
    ],
  },
  {
    parentKey: 'pe',
    title: '2025-2026-2 体育理论考试资料',
    audience: '需要准备体育理论考试的同学',
    description: '集中归档本学期体育理论考试通知与基础复习资料。',
    note: '具体考试范围、考试方式和课程要求请以体育教学部与任课教师通知为准。',
    sections: [
      {
        title: '考试通知',
        description: '先看时间与考试方式，再按资料范围进行复习。',
        files: [
          '2025-2026-2学期体育理论知识网上考试通知.pdf',
        ],
      },
      {
        title: '理论复习资料',
        description: '包含基础理论复习材料与体育舞蹈理论整理。',
        files: [
          '基础理论考试学习资料Microsoft_Word_文档.docx',
          '体育舞蹈理论考试资料_Microsoft_Word_文档.docx',
        ],
      },
    ],
  },
  {
    parentKey: 'courseReview',
    title: '电工复习资料',
    audience: '准备电工相关课程复习的同学',
    description: '归档可直接下载的电工复习材料，方便在课程复习入口继续补充同类资料。',
    note: '资料仅作复习参考，考试范围与标准答案请以任课教师要求为准。',
    sections: [
      {
        title: '复习附件',
        description: '当前收录 1 份电工复习资料。',
        files: ['电工复习.pdf'],
      },
    ],
  },
  {
    parentKey: 'assignments',
    title: '毕业论文上传与过程资料',
    audience: '正在提交毕业论文或上传过程资料的同学',
    description: '集中归档论文检测上传与毕业设计过程资料上传的操作手册。',
    note: '系统入口、开放时间和流程节点可能随学年变化，提交前请核对学院或教务正式通知。',
    sections: [
      {
        title: '操作手册',
        description: '包含论文上传、过程资料上传与查看报告单等常见步骤。',
        files: [
          '附件1：学生上传论文操作手册(1).docx',
          '上传毕业设计过程资料操作流程(1).docx',
        ],
      },
    ],
  },
  {
    parentKey: 'reportPrep',
    title: '2025年学生手册',
    audience: '新生和需要核对学生管理规定的在校生',
    description: '归档 2025 年学生手册原文件，便于在入学准备与日常办事时统一查阅。',
    note: '学生手册内容可能更新，涉及奖惩、学籍、评优等事项时请以当前有效版本为准。',
    sections: [
      {
        title: '手册原文件',
        description: '建议与当年学院通知配合使用。',
        files: ['2025年学生手册(终稿)(1).pdf'],
      },
    ],
  },
  {
    parentKey: 'dorm',
    title: '宿舍信息',
    audience: '新生和需要了解宿舍条件的同学',
    description: '归档宿舍相关资料，方便在寝室与床铺入口统一查看。',
    note: '宿舍分配、床位尺寸和生活安排请以学院及后勤当年通知为准。',
    sections: [
      {
        title: '宿舍资料',
        description: '当前收录宿舍说明文件 1 份。',
        files: ['宿舍.pdf'],
      },
    ],
  },
  {
    parentKey: 'mapTransit',
    title: '学校地图',
    audience: '新生和需要查找校园位置的同学',
    description: '归档校园地图原文件，方便快速定位教学楼、宿舍区和办事地点。',
    note: '施工、道路调整和新点位变动请以学校最新地图或现场指引为准。',
    sections: [
      {
        title: '地图附件',
        description: '建议下载后放大查看。',
        files: ['学校地图.pdf'],
      },
    ],
  },
  {
    parentKey: 'innovation',
    title: '2026年大创项目申报',
    audience: '准备申报 2026 年大学生创新创业训练计划项目的同学',
    description: '归档 2026 年大创项目申报通知，便于在科研与项目入口集中查看。',
    note: '项目名额、时间节点和申报要求均有时效性，请以学校正式通知和学院安排为准。',
    sections: [
      {
        title: '申报通知',
        description: '建议先核对申报范围、时间和材料要求。',
        files: ['转发：关于组织开展杭州电子科技大学2026年大学生创新创业训练计划项目申报的通知(1).pdf'],
      },
    ],
  },
  {
    parentKey: 'competition',
    title: '2026年学科竞赛认定与分类清单',
    audience: '准备参加竞赛或核对竞赛认定范围的同学',
    description: '归档 2026 年学科竞赛认定及分类清单，便于初步核对赛事类别与政策口径。',
    note: '竞赛认定范围与奖励政策可能更新，正式报名和成果认定前请查看最新官方通知。',
    sections: [
      {
        title: '政策原文件',
        description: '包含竞赛认定及分类清单通知原文。',
        files: ['关于公布2026年杭州电子科技大学学科竞赛认定及分类清单的通知（含附件）(1).pdf'],
      },
    ],
  },
  {
    parentKey: 'studentAffairs',
    title: '党校培训与社会实践',
    audience: '需要了解党校培训与社会实践安排的同学',
    description: '集中归档党校培训和社会实践通知，作为党团与实践导航页下的首批资料。',
    note: '此类活动通知时效性较强，参与前请再次核对发布单位、适用对象和时间要求。',
    sections: [
      {
        title: '党校培训',
        description: '当前收录 2026 年春季网上党校培训通知。',
        files: ['关于 2026 年春季网上党校（云课堂）培训的通知(1).pdf'],
      },
      {
        title: '社会实践',
        description: '当前收录 2024 年暑期社会实践通知院级稿件。',
        files: ['关于做好2024年杭州电子科技大学暑期社会实践工作的通知（院）(1).docx'],
      },
    ],
  },
  {
    parentKey: 'awards',
    title: '人艺数法学院综合测评细则',
    audience: '人艺数法学院需要了解综合测评规则的同学',
    description: '归档学院综合测评实施细则，便于在奖助与评优入口继续累积同类政策。',
    note: '综测细则、加分项和执行口径可能调整，评奖评优前请以学院最新正式版本为准。',
    sections: [
      {
        title: '细则原文件',
        description: '当前收录 2026 年修订版试行细则。',
        files: ['人艺数法学院学生综合测评实施细则（试行）2026年修订20260506(1).pdf'],
      },
    ],
  },
  {
    parentKey: 'degree',
    title: '2026届学士学位申请',
    audience: '准备办理 2026 届学士学位申请的毕业生',
    description: '归档学士学位申请通知原文件，便于在毕业与学位入口集中查看。',
    note: '资格条件、办理时间和材料要求请以学校当年毕业审核正式通知为准。',
    sections: [
      {
        title: '申请通知',
        description: '建议结合学院毕业安排一并核对。',
        files: ['关于2026届毕业生学士学位申请工作的通知(1).pdf'],
      },
    ],
  },
];

function clean(text) {
  return (text || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
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
    const response = await fetch(`/space/api/wiki/v2/tree/get_info/?wiki_token=${wikiToken}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=true`, { credentials: 'include' });
    return response.json();
  }, token);
}

async function ensurePage(page, csrf, parentToken, title) {
  let treeData = await fetchTree(page, parentToken);
  let node = (treeData.data.tree.child_map[parentToken] || [])
    .map((token) => treeData.data.tree.nodes[token])
    .find((child) => child?.title === title);
  if (node) return { node, created: false };

  const result = await page.evaluate(async ({ spaceId, parentToken, title, csrf }) => {
    const response = await fetch('/space/api/wiki/v2/tree/create_node/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrf,
        'docs-host-id': parentToken,
        'docs-host-type': 'Wiki',
        'doc-platform': 'web',
        'x-lsc-terminal': 'web',
      },
      body: JSON.stringify({
        space_id: spaceId,
        parent_wiki_token: parentToken,
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
  }, { spaceId, parentToken, title, csrf });
  if (result.status >= 300) {
    throw new Error(`Cannot create page ${title}: ${result.status} ${result.text}`);
  }

  await page.waitForTimeout(800);
  treeData = await fetchTree(page, parentToken);
  node = (treeData.data.tree.child_map[parentToken] || [])
    .map((token) => treeData.data.tree.nodes[token])
    .find((child) => child?.title === title);
  if (!node) throw new Error(`Created page is missing from tree: ${title}`);
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
  await page.waitForTimeout(2200);
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
  const waitMs = Math.max(8000, Math.min(80000, 4000 + filenames.length * 3000));
  await page.waitForTimeout(waitMs);
}

async function ensureParentToken(page, csrf, parentKey, cache) {
  if (cache.has(parentKey)) return cache.get(parentKey);
  const def = parentDefs[parentKey];
  if (!def) throw new Error(`Unknown parent key: ${parentKey}`);
  if (def.token) {
    cache.set(parentKey, def.token);
    return def.token;
  }

  const parentToken = await ensureParentToken(page, csrf, def.parentKey, cache);
  const ensured = await ensurePage(page, csrf, parentToken, def.title);
  cache.set(parentKey, ensured.node.wiki_token);

  if (def.introTitle && def.introText) {
    const navUrl = `${origin}/wiki/${ensured.node.wiki_token}`;
    await page.goto(navUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const text = await readBodyText(page);
    if (!text.includes(def.introText)) {
      const plain = `${def.introTitle}\n${def.introText}\n\n本页作为 ${publishDate} 新增导航页，用于继续承接同主题资料。`;
      const html = `<h1>${escapeHtml(def.introTitle)}</h1><p>${escapeHtml(def.introText)}</p><p><strong>整理记录：</strong>本页作为 ${publishDate} 新增导航页，用于继续承接同主题资料。</p>`;
      await appendRich(page, plain, html);
    }
  }

  return ensured.node.wiki_token;
}

async function publishPage(page, csrf, spec, parentCache) {
  const parentToken = await ensureParentToken(page, csrf, spec.parentKey, parentCache);
  const ensured = await ensurePage(page, csrf, parentToken, spec.title);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  let text = await readBodyText(page);
  const headerMarker = `本页收录于 ${publishDate}`;
  if (!text.includes(headerMarker)) {
    const plain = `资料说明\n${spec.description}\n\n适合查看：${spec.audience}\n\n${spec.note}\n\n本页收录于 ${publishDate}，由第二次资料补充任务整理发布。`;
    const html = `
      <h1>资料说明</h1>
      <p>${escapeHtml(spec.description)}</p>
      <blockquote><strong>适合查看：</strong>${escapeHtml(spec.audience)}</blockquote>
      <blockquote><strong>使用前请注意：</strong>${escapeHtml(spec.note)}</blockquote>
      <p><strong>整理记录：</strong>本页收录于 ${publishDate}，由第二次资料补充任务整理发布。</p>`;
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

    for (let start = 0; start < missing.length; start += 10) {
      const batch = missing.slice(start, start + 10);
      await uploadFiles(page, batch);
      uploaded.push(...batch);
    }

    text = await readBodyText(page);
    attachmentLabels = await readAttachmentLabels(page);
  }

  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const finalAttachmentLabels = await readAttachmentLabels(page);
  const missingAfterUpload = allFiles(spec).filter((filename) => !includesAttachment(finalAttachmentLabels, filename));
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

const specs = pageFilter ? pages.filter((spec) => spec.title.includes(pageFilter)) : pages;
if (specs.length === 0) throw new Error(`No page matched PAGE_FILTER=${pageFilter}`);

for (const filename of specs.flatMap(allFiles)) {
  const fullPath = path.join(sourceDir, filename);
  if (!fs.existsSync(fullPath)) throw new Error(`Source file does not exist: ${fullPath}`);
}

if (process.env.DRY_RUN === '1') {
  console.log(JSON.stringify(specs.map((spec) => ({
    title: spec.title,
    parentKey: spec.parentKey,
    files: allFiles(spec),
  })), null, 2));
  process.exit(0);
}

fs.mkdirSync(reportDir, { recursive: true });

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

const parentCache = new Map();
const results = [];
for (const spec of specs) {
  console.log(`Publishing ${spec.title} (${allFiles(spec).length} files)...`);
  results.push(await publishPage(page, csrf, spec, parentCache));
}

const report = {
  publishedAt: publishDate,
  pageCount: results.length,
  expectedFileCount: specs.flatMap(allFiles).length,
  uploadedFileCount: results.flatMap((result) => result.uploaded).length,
  missingFileCount: results.flatMap((result) => result.missingAfterUpload).length,
  results,
};

const reportPath = path.join(reportDir, 'feishu-upload-report-second-update.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));

await context.close();
