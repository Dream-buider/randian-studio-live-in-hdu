import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'outputs', '2026-07-21-feishu-40q-single-sheet');
const sourcePath = path.join(root, 'apps', 'freshman-mvp', 'data', 'presets.json');
const outputPath = path.join(outputDir, '2026新生40问_团队协作总表.xlsx');
const previewPath = path.join(outputDir, '40问协作总表-preview.png');

const state = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const items = Array.isArray(state.items) ? state.items : [];
if (items.length !== 40) throw new Error(`Expected 40 questions, received ${items.length}`);
if (new Set(items.map((item) => item.id)).size !== 40) throw new Error('Question IDs are not unique');
if (new Set(items.map((item) => item.question)).size !== 40) throw new Error('Questions are not unique');

const headers = [
  '问题编号',
  '问题分类',
  '新生问题',
  '回答要点',
  '填写状态',
  '认领/填写人',
  '回答者年级及专业',
  '学长学姐真实回答',
  '补充信息或参考来源',
  '管理员审核意见',
];

const rows = [
  headers,
  ...items.map((item, index) => [
    `Q${String(index + 1).padStart(2, '0')}`,
    item.category,
    item.question,
    item.intentDescription,
    '待填写',
    '',
    '',
    '',
    '',
    '',
  ]),
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('40问协作总表');
sheet.getRange('A1:J41').values = rows;
sheet.showGridLines = false;

sheet.getRange('A1:J1').format = {
  fill: '#3370FF',
  font: { bold: true, color: '#FFFFFF', size: 11 },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
  wrapText: true,
};
sheet.getRange('A2:D41').format = {
  fill: '#F5F8FF',
  font: { color: '#1F2329' },
  verticalAlignment: 'top',
};
sheet.getRange('E2:J41').format = {
  fill: '#FFFFFF',
  font: { color: '#1F2329' },
  verticalAlignment: 'top',
};
sheet.getRange('A1:J41').format.borders = {
  insideHorizontal: { style: 'thin', color: '#E5E6EB' },
  bottom: { style: 'thin', color: '#C9CDD4' },
};
sheet.getRange('C2:J41').format.wrapText = true;
sheet.getRange('A2:B41').format.horizontalAlignment = 'center';
sheet.getRange('E2:G41').format.horizontalAlignment = 'center';

const widths = {
  A: 11,
  B: 19,
  C: 43,
  D: 49,
  E: 13,
  F: 16,
  G: 22,
  H: 58,
  I: 38,
  J: 32,
};
for (const [column, width] of Object.entries(widths)) {
  sheet.getRange(`${column}1:${column}41`).format.columnWidth = width;
}
sheet.getRange('1:1').format.rowHeight = 34;
sheet.getRange('2:41').format.rowHeight = 52;

sheet.getRange('E2:E41').dataValidation = {
  rule: { type: 'list', values: ['待填写', '填写中', '待审核', '已完成', '需补充'] },
};

const statusRange = sheet.getRange('E2:E41');
statusRange.conditionalFormats.add('containsText', {
  text: '待填写',
  format: { fill: '#F2F3F5', font: { color: '#646A73' } },
});
statusRange.conditionalFormats.add('containsText', {
  text: '填写中',
  format: { fill: '#FFF3D6', font: { color: '#B76E00', bold: true } },
});
statusRange.conditionalFormats.add('containsText', {
  text: '待审核',
  format: { fill: '#E8F3FF', font: { color: '#1456B8', bold: true } },
});
statusRange.conditionalFormats.add('containsText', {
  text: '已完成',
  format: { fill: '#E8FFEA', font: { color: '#168A45', bold: true } },
});
statusRange.conditionalFormats.add('containsText', {
  text: '需补充',
  format: { fill: '#FFECE8', font: { color: '#C93B25', bold: true } },
});

const table = sheet.tables.add('A1:J41', true, 'FreshmanQuestionsCollaboration');
table.style = 'TableStyleMedium2';
table.showFilterButton = true;
table.showBandedRows = false;

// Apply panes after table creation so the exporter keeps both row and column freezes.
sheet.freezePanes.freezeRows(1);
sheet.freezePanes.freezeColumns(4);

await fs.mkdir(outputDir, { recursive: true });

const keyInspection = await workbook.inspect({
  kind: 'table',
  range: '40问协作总表!A1:J41',
  include: 'values,formulas',
  tableMaxRows: 45,
  tableMaxCols: 10,
  maxChars: 24000,
});
const formulaErrors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 100 },
  summary: 'final formula error scan',
});
console.log(keyInspection.ndjson);
console.log(formulaErrors.ndjson);

const preview = await workbook.render({
  sheetName: '40问协作总表',
  range: 'A1:J16',
  scale: 1,
  format: 'png',
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath, questionCount: items.length }));
