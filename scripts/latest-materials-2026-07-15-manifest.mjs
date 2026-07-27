import fs from 'node:fs';
import path from 'node:path';

export const publishDate = '2026-07-15';

export const pageSpecs = [
  {
    category: '课程复习 / 实时嵌入式系统',
    parentToken: 'EdTqwwPDwiuNuwkJjUecYCB5ncf',
    title: '期末复习 | 实时嵌入式系统',
    audience: '准备实时嵌入式系统课程期末考试、需要重点梳理或成套练习的同学',
    description: '在已有课程页补充重点整合、必考点梳理和多套练习卷，按“先看重点、再刷题”使用。',
    note: '资料包含学生整理与练习题截图，题目、答案和考试口径可能存在误差；考试范围与标准答案以任课教师当学期说明为准。',
    sections: [
      {
        title: '重点梳理',
        description: '两份 PDF 分别提供精简审查版和全量优先级版，适合考前快速过重点。',
        files: ['老师复习重点_整合审查版.pdf', '嵌入式课程期末考试必考点_全量优先级版(1).pdf'],
      },
      {
        title: '练习卷与题目整理',
        description: '包含不同题组及带作答截图版本，内容有交叉但并非完全重复。',
        files: ['嵌入式复习材料.docx', '实时嵌入式练习卷(1).docx', '题目整理.docx', '嵌入式习题卷.docx'],
      },
    ],
  },
  {
    category: '课程复习 / 电路分析',
    parentToken: 'EdTqwwPDwiuNuwkJjUecYCB5ncf',
    title: '期末复习 | 电路分析',
    audience: '准备电路分析相关课程期末考试、需要往年卷练习的同学',
    description: '归档 2023 年电路与电子技术类试卷题面及参考解答，适合作为限时练习。',
    note: '往年卷仅作练习参考，不代表当前学期题型、难度和考试范围；解答如有疑问请结合教材与任课教师口径核对。',
    sections: [{ title: '往年试卷与参考解答', description: '扫描件共 3 页，每页为双栏试卷及解答。', files: ['2023电分(1).pdf'] }],
  },
  {
    category: '课程复习 / 数字逻辑电路',
    parentToken: 'EdTqwwPDwiuNuwkJjUecYCB5ncf',
    title: '期末复习 | 数字逻辑电路',
    audience: '准备数字逻辑电路课程期末考试、需要往年卷练习的同学',
    description: '归档 2023 年数字逻辑电路 A 卷题面与参考解答，适合按四页题面完成后再核对答案。',
    note: '往年卷仅作练习参考，不代表当前学期题型、难度和考试范围；扫描件中的手写批注和参考解答请自行复核。',
    sections: [{ title: '往年试卷与参考解答', description: '文件共 8 页，前后分别为题面与带解答版本。', files: ['23年数电(1).pdf'] }],
  },
  {
    category: '课程复习 / 人工智能导论',
    parentToken: 'EdTqwwPDwiuNuwkJjUecYCB5ncf',
    title: '期末复习 | 人工智能导论',
    audience: '准备人工智能导论课程期末考试、需要按章节回顾知识点的同学',
    description: '归档 88 页人工智能导论总复习课件，覆盖机器学习、深度学习、自然语言处理等课程内容。',
    note: '课件标题沿用原文件名但内容经核验为人工智能导论，不是嵌入式或数字电路；考试重点仍以任课教师当学期说明为准。',
    sections: [{ title: '总复习课件', description: '原始 PPTX 可下载查看和检索。', files: ['chap14总复习(1).pptx'] }],
  },
  {
    category: '选课与学籍 / 通识课',
    parentToken: 'WkdvwmA0ziqpvYkS54CcfjuBnb1',
    title: '公选课资料与评价',
    audience: '在下沙校区准备选择通识选修课、体育课或公选课的同学',
    description: '集中归档课程评价表、选课图鉴与往届学生经验，便于先查课程再结合个人兴趣和时间安排做选择。',
    note: '本页内容主要来自往届学生个人体验，可能已过时，也不代表学校或社区立场；任课教师、时间地点、考核方式和容量必须以当学期教务系统为准。',
    sections: [
      { title: '结构化评价表', description: '适合按课程名、教师和评价内容检索。', files: ['公选课评价收集表.xlsx', '杭电公选课图鉴(1).xlsx'] },
      { title: '选课经验文档', description: '保留不同来源和不同年代的学生经验，阅读时务必结合当学期实际。', files: ['公选课选课指导(整合版).docx', '杭电推荐公选课+2.doc', '选课参考资料.doc'] },
    ],
  },
  {
    category: '发展与就业 / 奖助与评优',
    parentToken: 'Irojwa9BgiFnl6kFseGcaLhhnQc',
    title: '2026年本科生奖助评优政策',
    audience: '需要了解本科生奖学金、助学金、困难补助、资助认定和评优规则的同学',
    description: '集中归档学校 2026 年 6 月印发的 8 份奖助与评优红头文件，便于按事项直接查原文。',
    note: '本页提供原文件归档，不替代学校正式通知或学院执行口径；申请时间、名额、材料和动态标准请以当期通知为准。',
    sections: [
      {
        title: '2026年学校正式文件',
        description: '涵盖国家奖学金、励志奖学金、省政府奖学金、国家助学金、资助对象认定、困难补助、本科生奖学金及三好学生与优秀学生干部评审。',
        files: [
          '73_关于印发《杭州电子科技大学本科生国家奖.pdf',
          '74_关于印发《杭州电子科技大学国家励志奖学.pdf',
          '75_关于印发《杭州电子科技大学省政府奖学金.pdf',
          '76_关于印发《杭州电子科技大学国家助学金评.pdf',
          '77_关于印发《杭州电子科技大学学生资助对象.pdf',
          '78_关于印发《杭州电子科技大学困难补助管理.pdf',
          '79_关于印发《杭州电子科技大学本科生奖学金.pdf',
          '80_关于印发《杭州电子科技大学本科生三好学.pdf',
        ],
      },
    ],
  },
  {
    category: '发展与就业 / 竞赛入门',
    parentToken: 'Yw6XwdqUIizxtsk5DDJc2vZXnQc',
    title: '2026年学科竞赛管理规定',
    audience: '准备参加学科竞赛、组织校级竞赛或核对竞赛管理规则的同学',
    description: '归档杭电教〔2026〕92 号《杭州电子科技大学学科竞赛管理规定》原文件。',
    note: '竞赛分类、认定、组织和奖励口径可能另有配套文件或后续调整，报名和成果认定前请同步核对最新正式通知。',
    sections: [{ title: '学校正式文件', description: '2026 年 6 月 22 日印发，共 10 页。', files: ['杭州电子科技大学学科竞赛管理规定（杭电教[2026]92号）(2).pdf'] }],
  },
];

export const skippedFiles = [
  {
    filename: '嵌入式复习材料(1).docx',
    duplicateOf: '嵌入式复习材料.docx',
    reason: '规范化文本相似度 99.3%，仅有极少格式或字符差异；保留无后缀版本，避免页面出现近重复附件。',
  },
];

export function validateManifest({ sourceDir }) {
  const sourceFiles = fs.readdirSync(sourceDir).filter((name) => fs.statSync(path.join(sourceDir, name)).isFile()).sort();
  const publishFiles = pageSpecs.flatMap((page) => page.sections.flatMap((section) => section.files));
  const skipped = skippedFiles.map((item) => item.filename);
  const covered = [...publishFiles, ...skipped].sort();
  if (new Set(covered).size !== covered.length) throw new Error('Manifest contains a duplicated filename.');
  if (JSON.stringify(covered) !== JSON.stringify(sourceFiles)) throw new Error('Manifest does not cover the source directory exactly.');
  return { sourceFileCount: sourceFiles.length, publishFileCount: publishFiles.length, skippedFileCount: skipped.length, pageCount: pageSpecs.length };
}
