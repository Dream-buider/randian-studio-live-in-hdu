import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'outputs', '2026-07-21-feishu-40q');
const sourcePath = path.join(root, 'apps', 'freshman-mvp', 'data', 'presets.json');
const outputPath = path.join(outputDir, '2026新生40问_飞书导入版.xlsx');

const state = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const items = Array.isArray(state.items) ? state.items : [];
if (items.length !== 40) throw new Error(`Expected 40 questions, received ${items.length}`);
if (new Set(items.map((item) => item.id)).size !== 40) throw new Error('Question IDs are not unique');
if (new Set(items.map((item) => item.question)).size !== 40) throw new Error('Questions are not unique');

const workbook = Workbook.create();
const questions = workbook.worksheets.add('问题库');
const answers = workbook.worksheets.add('回答征集');

const questionRows = [
  ['问题编号', '问题分类', '标准问题', '征集要点', '当前状态'],
  ...items.map((item, index) => [
    `Q${String(index + 1).padStart(2, '0')}`,
    item.category,
    item.question,
    item.intentDescription,
    '征集中',
  ]),
];
questions.getRange('A1:E41').values = questionRows;
questions.getRange('A1:E1').format = {
  fill: '#3370FF',
  font: { bold: true, color: '#FFFFFF' },
  verticalAlignment: 'center',
};
questions.getRange('A2:E41').format = {
  font: { color: '#1F2329' },
  verticalAlignment: 'top',
};
questions.getRange('C2:D41').format.wrapText = true;
questions.getRange('A1:A41').format.columnWidth = 11;
questions.getRange('B1:B41').format.columnWidth = 18;
questions.getRange('C1:C41').format.columnWidth = 44;
questions.getRange('D1:D41').format.columnWidth = 58;
questions.getRange('E1:E41').format.columnWidth = 12;
questions.getRange('1:1').format.rowHeight = 26;
questions.getRange('2:41').format.rowHeight = 42;
questions.getRange('A1:E41').format.borders = {
  insideHorizontal: { style: 'thin', color: '#E5E6EB' },
};
questions.freezePanes.freezeRows(1);
questions.showGridLines = false;
const questionTable = questions.tables.add('A1:E41', true, 'QuestionLibrary');
questionTable.style = 'TableStyleMedium2';
questionTable.showFilterButton = true;

const answerHeaders = [[
  '选择问题',
  '真实回答',
  '回答者称呼',
  '入学年份',
  '学院/专业',
  '主要校区',
  '信息性质',
  '信息对应时间',
  '参考来源',
  '补充说明',
  '审核状态',
]];
answers.getRange('A1:K1').values = answerHeaders;
answers.getRange('A1:K1').format = {
  fill: '#00B578',
  font: { bold: true, color: '#FFFFFF' },
  verticalAlignment: 'center',
};
answers.getRange('A1:A101').format.columnWidth = 34;
answers.getRange('B1:B101').format.columnWidth = 60;
answers.getRange('C1:C101').format.columnWidth = 16;
answers.getRange('D1:D101').format.columnWidth = 12;
answers.getRange('E1:E101').format.columnWidth = 22;
answers.getRange('F1:F101').format.columnWidth = 16;
answers.getRange('G1:G101').format.columnWidth = 16;
answers.getRange('H1:H101').format.columnWidth = 18;
answers.getRange('I1:I101').format.columnWidth = 34;
answers.getRange('J1:J101').format.columnWidth = 36;
answers.getRange('K1:K101').format.columnWidth = 14;
answers.getRange('A2:K101').format.wrapText = true;
answers.getRange('A2:A101').dataValidation = {
  rule: { type: 'list', formula1: "'问题库'!$A$2:$A$41" },
};
answers.getRange('D2:D101').dataValidation = {
  rule: { type: 'list', values: ['2020及以前', '2021', '2022', '2023', '2024', '2025', '其他'] },
};
answers.getRange('G2:G101').dataValidation = {
  rule: { type: 'list', values: ['本人亲历', '身边同学亲历', '学院通知/老师说明', '听说，待核实'] },
};
answers.getRange('K2:K101').dataValidation = {
  rule: { type: 'list', values: ['待审核', '需补充', '已采纳', '不采纳'] },
};
answers.freezePanes.freezeRows(1);
answers.showGridLines = false;

await fs.mkdir(outputDir, { recursive: true });

const questionInspection = await workbook.inspect({
  kind: 'table',
  range: '问题库!A1:E41',
  include: 'values,formulas',
  tableMaxRows: 45,
  tableMaxCols: 6,
  maxChars: 12000,
});
const answerInspection = await workbook.inspect({
  kind: 'region',
  range: '回答征集!A1:K6',
  maxChars: 3500,
});
const formulaErrors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
});
console.log(questionInspection.ndjson);
console.log(answerInspection.ndjson);
console.log(formulaErrors.ndjson);

for (const [sheetName, filename, range] of [
  ['问题库', '问题库-preview.png', 'A1:E41'],
  ['回答征集', '回答征集-preview.png', 'A1:K12'],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: 'png' });
  await fs.writeFile(path.join(outputDir, filename), new Uint8Array(await preview.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, questionCount: items.length }));
