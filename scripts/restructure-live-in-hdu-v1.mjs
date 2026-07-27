import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\.pw-edge-profile';
const originUrl = 'https://scnbcye3xdfz.feishu.cn/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc';
const spaceId = '7639362813286190049';
const rootToken = 'I0OwwcBeLiIHZOkmpTScv0MEnyc';

const topRenames = {
  XI0hwjd9biAw6Kkz3afcmEGxn6g: '开始使用',
  D1XDwzXHzij7cGkrqLqczfxKnQK: '新生入学',
  QJBTwbEjBi2dHAkIYUhctR5gn6c: '学业与课程',
  AHNcw3RRPijtvkkOfnkcWoclnLd: '选课与学籍',
  OrrWwVnuRiTuCMkM558cB9FanZb: '实验室与科研',
  OJ6awgyosi1PxmkgCedcKk2LnVb: '校园生活',
  Xw2EwFV74inAGtkiyl7cQk0lnFc: '发展与就业',
  XVWawcqdOi6B1fkVXtOcPHcMnpf: '共建与反馈',
};

const duplicateHomeToken = 'EsamwS4JCinpBWkW1ICcD1H9nPb';
const startToken = 'XI0hwjd9biAw6Kkz3afcmEGxn6g';

const childPlans = {
  [startToken]: {
    rename: {
      [duplicateHomeToken]: '关于 LIVE IN HDU',
    },
    ensure: ['快速导航', '搜索指南', '新生必看', '热门问题', '官方入口', '使用规则', '关于 LIVE IN HDU'],
  },
  D1XDwzXHzij7cGkrqLqczfxKnQK: {
    rename: {
      ZdEjw1OkuiTD1ikCJiacz8RUntf: '报到前准备',
      EoVswjTIBizT4IknvFOczycqn7g: '报到当天流程',
      EnR4wxqLaiSQe3k7mkKc8aQsn1b: '寝室与床铺',
      FZilwGvZ6iXEuCkPt5LcMCkEnKb: '校园卡与网络',
      ZSoIwJJX8i3f9ykk2TDcP05TnAh: '快递与外卖',
      MJYjwvoM6iwffqki6RjcIRFRnIb: '食堂与超市',
      Jez1w79iUiH53xkWzytcBUHqnch: '校园地图与通勤',
    },
    ensure: ['报到前准备', '报到当天流程', '寝室与床铺', '校园卡与网络', '快递与外卖', '食堂与超市', '校园地图与通勤', '新生常见问题'],
  },
  QJBTwbEjBi2dHAkIYUhctR5gn6c: {
    rename: {
      V2umw0s4diCjhEk3RBhcoyTdn07: '数理基础课',
      EdTqwwPDwiuNuwkJjUecYCB5ncf: '课程复习',
      Ijh8wkBOLivD6ckyF9mclS7in1b: '历年卷',
      B06rwVMwsivYbNkunJxcRYoInCb: '程序设计',
      C2DPwYGJRiznjJkRzp4cvmkYnzO: '英语四六级',
      MxkhwE7LeiVHpUkz0SNcertHnpc: '作业与实验',
    },
    ensure: ['GPA攻略', '课程复习', '历年卷', '作业与实验', '程序设计', '数理基础课', '英语四六级', '考试周'],
  },
  AHNcw3RRPijtvkkOfnkcWoclnLd: {
    rename: {
      Y99xwgvpDiF6L2kPZ4ycTIhQn7g: '选课',
      L132wa25kiQm6LkunfQcQUHNnAg: '体育课',
      W3IywdBT8iDKxskWGg4cR19DnAc: '重修补考缓考',
      IxyqwU84Di3mGgkJnMRcRl6jnig: '转专业',
      HC1iwI8G8ixT24kHbaUcnxTlnGe: '培养方案',
    },
    ensure: ['选课', '体育课', '通识课', '重修补考缓考', '转专业', '培养方案', '成绩单与证明', '学籍异动'],
  },
  OrrWwVnuRiTuCMkM558cB9FanZb: {
    rename: {
      P86wwxXXsiFJhzkbTCjcCKE5nFh: '找实验室',
      DznLwDmU8idVxNk6t7LcOd0pnIf: '实验室名单',
      EuhqwbOBJioCeFk0TsXcFysynJb: '加入实验室',
      DueQwOWkqiCYkmkF79VcGeKVn3d: '科研入门',
      GktfwoSkuiD0T6kDq9acOMDen8c: '大创项目',
    },
    ensure: ['找实验室', '实验室名单', '加入实验室', '科研入门', '大创项目', '导师联系', '面试经验'],
  },
  OJ6awgyosi1PxmkgCedcKk2LnVb: {
    rename: {
      CIZlwDZqji03vmkn6kIcqVSKnje: '校园卡',
      EQW4wx9T7iekmQkp8KZc8yfDnVd: '网络与水电',
      Yq1awoAI8iTWtqk6ExOcXGdNnsd: '快递',
      At2bwkJ50iiP4ckZmMtcMJGHnjN: '外卖',
    },
    ensure: ['校园卡', '网络与水电', '快递', '外卖', '打印', '食堂超市', '宿舍维修', '医保校医院', '交通地图', '安全防骗'],
  },
  Xw2EwFV74inAGtkiyl7cQk0lnFc: {
    rename: {
      '': '',
    },
    ensure: ['竞赛入门', '保研', '考研', '实习', '秋招春招', '简历面试', '证书考试', '项目作品集'],
  },
  XVWawcqdOi6B1fkVXtOcPHcMnpf: {
    rename: {},
    ensure: ['如何投稿', '投稿模板', '内容规范', '纠错反馈', '更新日志', '贡献者名单', '维护任务'],
  },
};

const xw2ChildRenameByTitle = {
  新生常见问题: '竞赛入门',
  学业常见问题: '保研',
  生活常见问题: '考研',
  问答维护规则: '实习',
};

const communityRenameByTitle = {
  如何投稿: '如何投稿',
  内容规范: '内容规范',
  贡献者名单: '贡献者名单',
  更新日志: '更新日志',
  反馈与纠错: '纠错反馈',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTree(page, wikiToken) {
  return page.evaluate(async (token) => {
    const url = `/space/api/wiki/v2/tree/get_info/?wiki_token=${token}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=true`;
    const res = await fetch(url, { credentials: 'include' });
    return res.json();
  }, wikiToken);
}

function collectNodes(treeData) {
  return treeData.data.tree.nodes;
}

async function renameNode(request, csrf, node, name, results) {
  if (!node || !name || node.title === name) return;
  const res = await request.post('https://scnbcye3xdfz.feishu.cn/space/api/wiki/v2/tree/update_title/', {
    headers: {
      'content-type': 'application/json',
      'x-csrftoken': csrf,
      referer: originUrl,
    },
    data: {
      wiki_token: node.wiki_token,
      obj_token: node.obj_token || '',
      name,
    },
  });
  const text = await res.text();
  results.push({ action: 'rename', from: node.title, to: name, token: node.wiki_token, status: res.status(), text });
  await sleep(250);
}

async function moveNode(request, csrf, node, newParentToken, results) {
  if (!node || node.parent_wiki_token === newParentToken) return;
  const res = await request.post('https://scnbcye3xdfz.feishu.cn/space/api/wiki/v2/tree/move_node/', {
    headers: {
      'content-type': 'application/json',
      'x-csrftoken': csrf,
      referer: originUrl,
    },
    data: {
      old_parent_wiki_token: node.parent_wiki_token,
      old_space_id: node.space_id,
      new_parent_wiki_token: newParentToken,
      new_space_id: spaceId,
      wiki_token: node.wiki_token,
      to_last: true,
      previous_token: '',
      synergy_uuid: String(Date.now()),
    },
  });
  const text = await res.text();
  results.push({ action: 'move', title: node.title, token: node.wiki_token, to: newParentToken, status: res.status(), text });
  await sleep(350);
}

async function createNode(page, csrf, parentToken, title, results) {
  const result = await page.evaluate(async ({ spaceId, parentToken, title, csrf }) => {
    const res = await fetch('/space/api/wiki/v2/tree/create_node/', {
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
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text };
    }
  }, { spaceId, parentToken, title, csrf });
  results.push({ action: 'create', parentToken, title, result });
  await sleep(350);
}

async function ensureChildren(page, csrf, parentToken, expectedTitles, results) {
  const data = await fetchTree(page, parentToken);
  const tree = data.data.tree;
  const childTokens = tree.child_map[parentToken] || [];
  const titles = new Set(childTokens.map((token) => tree.nodes[token]?.title).filter(Boolean));
  for (const title of expectedTitles) {
    if (!titles.has(title)) {
      await createNode(page, csrf, parentToken, title, results);
      titles.add(title);
    }
  }
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});

const page = context.pages()[0] ?? await context.newPage();
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const csrf = (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
const results = [];

let rootData = await fetchTree(page, rootToken);
let nodes = collectNodes(rootData);

await moveNode(context.request, csrf, nodes[duplicateHomeToken], startToken, results);
rootData = await fetchTree(page, rootToken);
nodes = collectNodes(rootData);

for (const [token, title] of Object.entries(topRenames)) {
  await renameNode(context.request, csrf, nodes[token], title, results);
}

for (const [parentToken, plan] of Object.entries(childPlans)) {
  const data = await fetchTree(page, parentToken);
  const childNodes = collectNodes(data);

  for (const [token, title] of Object.entries(plan.rename || {})) {
    if (token && childNodes[token]) {
      await renameNode(context.request, csrf, childNodes[token], title, results);
    }
  }

  if (parentToken === 'Xw2EwFV74inAGtkiyl7cQk0lnFc') {
    for (const node of Object.values(childNodes)) {
      const nextTitle = xw2ChildRenameByTitle[node.title];
      if (nextTitle) await renameNode(context.request, csrf, node, nextTitle, results);
    }
  }

  if (parentToken === 'XVWawcqdOi6B1fkVXtOcPHcMnpf') {
    for (const node of Object.values(childNodes)) {
      const nextTitle = communityRenameByTitle[node.title];
      if (nextTitle) await renameNode(context.request, csrf, node, nextTitle, results);
    }
  }

  await ensureChildren(page, csrf, parentToken, plan.ensure, results);
}

const finalRoot = await fetchTree(page, rootToken);
const finalTree = finalRoot.data.tree;
const rootChildren = finalTree.child_map[rootToken] || [];
const rootSummary = rootChildren.map((token) => ({
  title: finalTree.nodes[token]?.title,
  token,
  url: finalTree.nodes[token]?.url,
}));

console.log(JSON.stringify({ results, rootSummary }, null, 2));
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\live-in-hdu-ia-v1.png', fullPage: true });
await context.close();
