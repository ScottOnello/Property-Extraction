import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputDir = process.argv[2] || "outputs/latest";
const outputPath = process.argv[3] || `${inputDir}/fourplex_prospects.xlsx`;
const prospectsCsv = await fs.readFile(`${inputDir}/fourplex_prospects.csv`, "utf8");
const allCsv = await fs.readFile(`${inputDir}/all_fourplexes.csv`, "utf8");
const summaryJson = JSON.parse(await fs.readFile(`${inputDir}/run_summary.json`, "utf8"));

const workbook = await Workbook.fromCSV(prospectsCsv, { sheetName: "Prospects" });
await workbook.fromCSV(allCsv, { sheetName: "All Fourplexes" });
const summary = workbook.worksheets.add("Summary");
const rubric = workbook.worksheets.add("Scoring Rubric");

const navy = "#17324D";
const teal = "#177E89";
const pale = "#EAF3F5";
const amber = "#F4B942";
for (const name of ["Prospects", "All Fourplexes"]) {
  const sheet = workbook.worksheets.getItem(name);
  const used = sheet.getUsedRange();
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(2);
  used.format.font = { name: "Aptos", size: 10, color: "#263238" };
  const header = used.getRow(0);
  header.format = { fill: navy, font: { name: "Aptos Display", bold: true, color: "#FFFFFF", size: 10 }, wrapText: true, rowHeight: 34 };
  used.format.autofitColumns();
  const widths = {
    A: 12, B: 48, C: 25, D: 16, F: 27, G: 22, H: 25, I: 18, J: 11,
    K: 13, L: 14, M: 17, N: 13, O: 12, R: 19, S: 15, T: 20, U: 15,
    AC: 30, AD: 45,
  };
  for (const [col, width] of Object.entries(widths)) sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  sheet.getRange(`A2:A${used.rowCount}`).format.numberFormat = "0";
  sheet.getRange(`N2:N${used.rowCount}`).format.numberFormat = "yyyy-mm-dd";
  sheet.getRange(`O2:O${used.rowCount}`).format.numberFormat = "0";
  sheet.getRange(`Y2:AB${used.rowCount}`).format.numberFormat = "$#,##0";
  sheet.getRange(`A2:A${used.rowCount}`).conditionalFormats.add("colorScale", {
    thresholds: ["min", "50%", "max"], colors: ["#FFF3CD", amber, "#2E7D32"],
  });
  sheet.tables.add(`A1:AD${used.rowCount}`, true, name === "Prospects" ? "ProspectsTable" : "AllFourplexesTable").style = "TableStyleMedium2";
}

summary.showGridLines = false;
summary.getRange("A1:H2").merge();
summary.getRange("A1").values = [["Anchorage Fourplex Prospecting Report"]];
summary.getRange("A1:H2").format = { fill: navy, font: { name: "Aptos Display", size: 22, bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
summary.getRange("A4:B9").values = [
  ["Metric", "Value"], ["All fourplex parcels", null], ["20+ year prospects", null],
  ["Maximum opportunity score", null], ["As-of date", new Date(`${summaryJson.as_of}T00:00:00Z`)],
  ["Scoring version", summaryJson.scoring_version],
];
summary.getRange("B5").formulas = [["=COUNTA('All Fourplexes'!$D$2:$D$2000)"]];
summary.getRange("B6").formulas = [["=COUNTA('Prospects'!$D$2:$D$500)"]];
summary.getRange("B7").formulas = [["=MAX('Prospects'!$A$2:$A$500)"]];
summary.getRange("B8").format.numberFormat = "yyyy-mm-dd";
summary.getRange("B9").format.numberFormat = "0.0";
summary.getRange("A4:B4").format = { fill: teal, font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A5:A9").format = { fill: pale, font: { bold: true } };
summary.getRange("D4:H4").merge();
summary.getRange("D4").values = [["Important interpretation"]];
summary.getRange("D5:H8").merge();
summary.getRange("D5").values = [[summaryJson.disclaimer + " Deed date is a screening proxy and may reflect trust, estate, entity, or intra-family transfers."]];
summary.getRange("D4:H4").format = { fill: amber, font: { bold: true, color: navy } };
summary.getRange("D5:H8").format = { fill: "#FFF8E1", wrapText: true, verticalAlignment: "top" };
summary.getRange("A11:B14").values = [
  ["Run detail", "Value"], ["Retrieved UTC", summaryJson.retrieved_at_utc],
  ["Base query", summaryJson.base_query], ["Source", summaryJson.source_layer_url],
];
summary.getRange("B12").format.numberFormat = "yyyy-mm-dd hh:mm";
summary.getRange("A11:B11").format = { fill: teal, font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A1:H14").format.font = { name: "Aptos", size: 11, color: "#263238" };
summary.getRange("A1:H2").format.font = { name: "Aptos Display", size: 22, bold: true, color: "#FFFFFF" };
summary.getRange("A:A").format.columnWidth = 28;
summary.getRange("B:B").format.columnWidth = 45;
summary.getRange("C:C").format.columnWidth = 3;
summary.getRange("D:H").format.columnWidth = 15;

rubric.showGridLines = false;
rubric.getRange("A1:C2").merge();
rubric.getRange("A1").values = [["Opportunity Score Rubric"]];
rubric.getRange("A1:C2").format = { fill: navy, font: { name: "Aptos Display", size: 20, bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
rubric.getRange("A4:C12").values = [
  ["Signal", "Rule", "Points"], ["Ownership duration", "20–24 years", 20],
  ["Ownership duration", "25–34 years", 30], ["Ownership duration", "35+ years", 40],
  ["Absentee indicator", "Mailing address differs", 15], ["Out of state", "Mailing state is not AK", 20],
  ["Owner type", "Individual, estate, or trust", 10], ["Building age", "Built 1979 or earlier", 15],
  ["Building age", "Built 1980–1989 / 1990–1999", "10 / 5"],
];
rubric.getRange("A4:C4").format = { fill: teal, font: { bold: true, color: "#FFFFFF" } };
rubric.getRange("A5:C12").format.borders = { preset: "inside", style: "thin", color: "#D6E1E5" };
rubric.getRange("A:A").format.columnWidth = 25;
rubric.getRange("B:B").format.columnWidth = 39;
rubric.getRange("C:C").format.columnWidth = 14;
rubric.getRange("A14:C16").merge();
rubric.getRange("A14").values = [["Missing information earns no points. This score prioritizes objective public-record signals and is not a claim about owner motivation or property condition."]];
rubric.getRange("A14:C16").format = { fill: "#FFF8E1", wrapText: true, verticalAlignment: "top" };

const outputDir = outputPath.replace(/[\\/][^\\/]+$/, "");
await fs.mkdir(outputDir, { recursive: true });
const previewDir = `${outputDir}/previews`;
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of [["Summary", "A1:H14"], ["Prospects", "A1:J18"], ["All Fourplexes", "A1:J18"], ["Scoring Rubric", "A1:C16"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${sheetName.replaceAll(" ", "_")}.png`, new Uint8Array(await preview.arrayBuffer()));
}
console.log((await workbook.inspect({ kind: "table", range: "Summary!A1:H14", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 10 })).ndjson);
console.log((await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" })).ndjson);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Saved ${outputPath}`);
