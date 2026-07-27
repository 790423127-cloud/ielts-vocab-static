import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const sourcePath = path.join(outputDir, "guixue-ielts-376-source.json");
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const rows = source.rows;
const groups = source.groups;

if (rows.length !== 376 || groups.length !== 8) {
  throw new Error(`数据数量异常：${rows.length}词、${groups.length}组`);
}

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add("说明与汇总");
const dataSheet = workbook.worksheets.add("376词表");

summarySheet.showGridLines = false;
dataSheet.showGridLines = false;

summarySheet.mergeCells("A1:F1");
summarySheet.getRange("A1").values = [["雅思阅读538考点词真经（网站实际376词）"]];
summarySheet.getRange("A1:F1").format = {
  fill: "#0F766E",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center"
};
summarySheet.getRange("A1:F1").format.rowHeight = 34;

summarySheet.getRange("A3:B7").values = [
  ["项目", "结果"],
  ["网站词书名称", "雅思阅读538考点词真经"],
  ["网站当前实际词数", rows.length],
  ["分组数量", groups.length],
  ["数据来源", source.source]
];
summarySheet.getRange("A3:B3").format = {
  fill: "#D97706",
  font: { bold: true, color: "#FFFFFF" }
};
summarySheet.getRange("A4:A7").format = {
  fill: "#FEF3C7",
  font: { bold: true, color: "#92400E" }
};
summarySheet.getRange("A3:B7").format.borders = {
  preset: "inside",
  style: "thin",
  color: "#E5E7EB"
};
summarySheet.getRange("A4:B6").format.rowHeight = 28;
summarySheet.getRange("A7:B7").format.rowHeight = 42;
summarySheet.getRange("B4:B7").format.wrapText = true;

summarySheet.getRange("A9:F9").values = [[
  "类别", "分组", "网站标称词数", "提取词数", "校验", "来源链接"
]];

const groupRows = groups.map((group) => {
  const match = group.title.match(/第(\d+)类考点词-第(\d+)组/);
  return [
    Number(match?.[1] || 0),
    Number(match?.[2] || 0),
    group.rows.length,
    null,
    null,
    group.url
  ];
});

summarySheet.getRange(`A10:F${9 + groupRows.length}`).values = groupRows;
for (let offset = 0; offset < groupRows.length; offset += 1) {
  const rowNumber = 10 + offset;
  summarySheet.getRange(`D${rowNumber}`).formulas = [[
    `=COUNTIFS('376词表'!$B$6:$B$381,A${rowNumber},'376词表'!$C$6:$C$381,B${rowNumber})`
  ]];
  summarySheet.getRange(`E${rowNumber}`).formulas = [[
    `=IF(C${rowNumber}=D${rowNumber},"通过","不一致")`
  ]];
}

const summaryTable = summarySheet.tables.add("A9:F17", true, "GroupSummaryTable");
summaryTable.style = "TableStyleMedium4";
summaryTable.showFilterButton = true;
summarySheet.freezePanes.freezeRows(9);
summarySheet.getRange("A1:F17").format.verticalAlignment = "center";
summarySheet.getRange("F10:F17").format.wrapText = true;
summarySheet.getRange("A:A").format.columnWidth = 12;
summarySheet.getRange("B:B").format.columnWidth = 12;
summarySheet.getRange("C:D").format.columnWidth = 16;
summarySheet.getRange("E:E").format.columnWidth = 12;
summarySheet.getRange("F:F").format.columnWidth = 52;
summarySheet.getRange("A10:E17").format.horizontalAlignment = "center";
summarySheet.getRange("A10:F17").format.rowHeight = 34;

dataSheet.mergeCells("A1:I1");
dataSheet.getRange("A1").values = [["雅思阅读538考点词真经｜网站当前实际376词"]];
dataSheet.getRange("A1:I1").format = {
  fill: "#0F766E",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center"
};
dataSheet.getRange("A1:I1").format.rowHeight = 34;

dataSheet.mergeCells("A2:I2");
dataSheet.getRange("A2").values = [[
  "按网站可见的8个播放列表整理；保留原顺序、音标、同替词和中文释义。"
]];
dataSheet.getRange("A2:I2").format = {
  fill: "#D1FAE5",
  font: { color: "#065F46" },
  horizontalAlignment: "left",
  verticalAlignment: "center"
};

dataSheet.mergeCells("A3:I3");
dataSheet.getRange("A3").values = [[`来源：${source.source}`]];
dataSheet.getRange("A3:I3").format = {
  fill: "#F3F4F6",
  font: { color: "#4B5563" },
  horizontalAlignment: "left",
  verticalAlignment: "center"
};

dataSheet.getRange("A5:I5").values = [[
  "总序号", "类别", "分组", "组内序号", "单词/短语", "音标", "同替词", "中文释义", "来源链接"
]];

const dataMatrix = rows.map((row) => [
  row.globalIndex,
  row.category,
  row.group,
  row.groupIndex,
  row.word,
  row.phonetic,
  row.synonyms.join("；"),
  row.meaning,
  row.sourceUrl
]);

dataSheet.getRange(`A6:I${5 + dataMatrix.length}`).values = dataMatrix;
const wordsTable = dataSheet.tables.add(`A5:I${5 + dataMatrix.length}`, true, "GuixueIelts376Table");
wordsTable.style = "TableStyleMedium4";
wordsTable.showFilterButton = true;
dataSheet.freezePanes.freezeRows(5);
dataSheet.freezePanes.freezeColumns(4);

dataSheet.getRange(`A6:D${5 + dataMatrix.length}`).format.horizontalAlignment = "center";
dataSheet.getRange(`A5:I${5 + dataMatrix.length}`).format.verticalAlignment = "center";
dataSheet.getRange(`F6:I${5 + dataMatrix.length}`).format.wrapText = true;
dataSheet.getRange(`A6:D${5 + dataMatrix.length}`).format.numberFormat = "0";
dataSheet.getRange(`A6:I${5 + dataMatrix.length}`).format.rowHeight = 42;
dataSheet.getRange("A:A").format.columnWidth = 10;
dataSheet.getRange("B:D").format.columnWidth = 10;
dataSheet.getRange("E:E").format.columnWidth = 22;
dataSheet.getRange("F:F").format.columnWidth = 20;
dataSheet.getRange("G:G").format.columnWidth = 42;
dataSheet.getRange("H:H").format.columnWidth = 32;
dataSheet.getRange("I:I").format.columnWidth = 54;

const summaryInspection = await workbook.inspect({
  kind: "table",
  sheetId: "说明与汇总",
  range: "A1:F17",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 8,
  maxChars: 7000
});
console.log(summaryInspection.ndjson);

const dataInspection = await workbook.inspect({
  kind: "table",
  sheetId: "376词表",
  range: "A1:I12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 10,
  maxChars: 7000
});
console.log(dataInspection.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan"
});
console.log(formulaErrors.ndjson);

const workbookOutput = await SpreadsheetFile.exportXlsx(workbook);
await workbookOutput.save(path.join(outputDir, "雅思阅读538考点词真经-网站实际376词.xlsx"));

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvHeaders = [
  "总序号", "类别", "分组", "组内序号", "单词/短语", "音标", "同替词", "中文释义", "来源链接"
];
const csvLines = [
  csvHeaders,
  ...dataMatrix
].map((row) => row.map(csvCell).join(","));
await fs.writeFile(
  path.join(outputDir, "雅思阅读538考点词真经-网站实际376词.csv"),
  `\uFEFF${csvLines.join("\r\n")}`,
  "utf8"
);

console.log(JSON.stringify({
  xlsx: path.join(outputDir, "雅思阅读538考点词真经-网站实际376词.xlsx"),
  csv: path.join(outputDir, "雅思阅读538考点词真经-网站实际376词.csv"),
  rows: rows.length,
  groups: groups.length
}, null, 2));
