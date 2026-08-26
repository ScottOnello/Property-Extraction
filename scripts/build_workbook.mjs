import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputDir = process.argv[2] || "outputs/latest";
const outputPath = process.argv[3] || `${inputDir}/fourplex_prospects.xlsx`;
const prospectsCsv = await fs.readFile(`${inputDir}/fourplex_prospects.csv`, "utf8");
const allCsv = await fs.readFile(`${inputDir}/all_fourplexes.csv`, "utf8");
const portfoliosCsv = await fs.readFile(`${inputDir}/owner_portfolios.csv`, "utf8");
const summaryJson = JSON.parse(await fs.readFile(`${inputDir}/run_summary.json`, "utf8"));

const workbook = await Workbook.fromCSV(prospectsCsv, { sheetName: "Prospects" });
await workbook.fromCSV(allCsv, { sheetName: "All Fourplexes" });
await workbook.fromCSV(portfoliosCsv, { sheetName: "Owner Portfolios" });
const summary = workbook.worksheets.add("Summary");
const rubric = workbook.worksheets.add("Scoring Rubric");

const navy = "#17324D";
const teal = "#177E89";
const pale = "#EAF3F5";
const amber = "#F4B942";
const tableNames = { Prospects: "ProspectsTable", "All Fourplexes": "AllFourplexesTable", "Owner Portfolios": "OwnerPortfoliosTable" };
for (const name of ["Prospects", "All Fourplexes", "Owner Portfolios"]) {
  const sheet = workbook.worksheets.getItem(name);
  const used = sheet.getUsedRange();
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(2);
  used.format.font = { name: "Aptos", size: 10, color: "#263238" };
  const header = used.getRow(0);
  header.format = { fill: navy, font: { name: "Aptos Display", bold: true, color: "#FFFFFF", size: 10 }, wrapText: true, rowHeight: 34 };
  used.format.autofitColumns();
  const widths = name === "Owner Portfolios" ? {
    A: 14, B: 30, C: 28, D: 34, E: 22, F: 14, G: 14, H: 14, I: 18,
    J: 16, K: 16, L: 16, M: 12, N: 28, O: 18, P: 12, Q: 14, R: 60, S: 45,
  } : {
    A: 14, B: 12, C: 10, D: 48, E: 25, F: 16, G: 12, H: 28, I: 20, J: 26,
    K: 28, L: 34, M: 14, N: 14, O: 18, P: 14, Q: 18, R: 11, S: 13,
    T: 14, U: 16, V: 13, W: 12, X: 12, Y: 12, Z: 19, AA: 15, AB: 20,
    AC: 15, AD: 14, AE: 14, AF: 16, AG: 18, AH: 18, AI: 16, AJ: 16,
    AK: 30, AL: 45,
  };
  for (const [col, width] of Object.entries(widths)) sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  if (name === "Owner Portfolios") {
    sheet.getRange(`A2:A${used.rowCount}`).format.numberFormat = "0";
    sheet.getRange(`I2:I${used.rowCount}`).format.numberFormat = "$#,##0";
  } else {
    sheet.getRange(`A2:C${used.rowCount}`).format.numberFormat = "0";
    sheet.getRange(`O2:O${used.rowCount}`).format.numberFormat = "$#,##0";
    sheet.getRange(`V2:V${used.rowCount}`).format.numberFormat = "yyyy-mm-dd";
    sheet.getRange(`AF2:AJ${used.rowCount}`).format.numberFormat = "$#,##0";
  }
  sheet.getRange(`A2:A${used.rowCount}`).conditionalFormats.add("colorScale", {
    thresholds: ["min", "50%", "max"], colors: ["#FFF3CD", amber, "#2E7D32"],
  });
  const lastColumn = name === "Owner Portfolios" ? "S" : "AL";
  sheet.tables.add(`A1:${lastColumn}${used.rowCount}`, true, tableNames[name]).style = "TableStyleMedium2";
}

summary.showGridLines = false;
summary.getRange("A1:H2").merge();
summary.getRange("A1").values = [["Anchorage Fourplex Prospecting Report"]];
summary.getRange("A1:H2").format = { fill: navy, font: { name: "Aptos Display", size: 22, bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
summary.getRange("A4:B11").values = [
  ["Metric", "Value"], ["All fourplex parcels", null], ["20+ year prospects", null],
  ["Normalized owner groups", null], ["Multi-fourplex owner groups", null],
  ["Maximum enhanced score", null], ["As-of date", new Date(`${summaryJson.as_of}T00:00:00Z`)],
  ["Scoring version", summaryJson.scoring_version],
];
summary.getRange("B5").formulas = [["=COUNTA('All Fourplexes'!$F$2:$F$2000)"]];
summary.getRange("B6").formulas = [["=COUNTA('Prospects'!$F$2:$F$500)"]];
summary.getRange("B7").formulas = [["=COUNTA('Owner Portfolios'!$D$2:$D$2000)"]];
summary.getRange("B8").formulas = [["=COUNTIF('Owner Portfolios'!$F$2:$F$2000,\">=2\")"]];
summary.getRange("B9").formulas = [["=MAX('Prospects'!$A$2:$A$500)"]];
summary.getRange("B10").format.numberFormat = "yyyy-mm-dd";
summary.getRange("B11").format.numberFormat = "0.0";
summary.getRange("A4:B4").format = { fill: teal, font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A5:A11").format = { fill: pale, font: { bold: true } };
summary.getRange("D4:H4").merge();
summary.getRange("D4").values = [["Important interpretation"]];
summary.getRange("D5:H10").merge();
summary.getRange("D5").values = [[summaryJson.disclaimer + " Deed date is a screening proxy and may reflect trust, estate, entity, or intra-family transfers. Portfolio counts cover fourplex parcels in this MOA assessment layer only; normalized owner matches require human verification."]];
summary.getRange("D4:H4").format = { fill: amber, font: { bold: true, color: navy } };
summary.getRange("D5:H10").format = { fill: "#FFF8E1", wrapText: true, verticalAlignment: "top" };
summary.getRange("A13:B16").values = [
  ["Run detail", "Value"], ["Retrieved UTC", summaryJson.retrieved_at_utc],
  ["Base query", summaryJson.base_query], ["Source", summaryJson.source_layer_url],
];
summary.getRange("B14").format.numberFormat = "yyyy-mm-dd hh:mm";
summary.getRange("A13:B13").format = { fill: teal, font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A1:H16").format.font = { name: "Aptos", size: 11, color: "#263238" };
summary.getRange("A1:H2").format.font = { name: "Aptos Display", size: 22, bold: true, color: "#FFFFFF" };
summary.getRange("A:A").format.columnWidth = 28;
summary.getRange("B:B").format.columnWidth = 45;
summary.getRange("C:C").format.columnWidth = 3;
summary.getRange("D:H").format.columnWidth = 15;

rubric.showGridLines = false;
rubric.getRange("A1:C2").merge();
rubric.getRange("A1").values = [["Opportunity Score Rubric"]];
rubric.getRange("A1:C2").format = { fill: navy, font: { name: "Aptos Display", size: 20, bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
rubric.getRange("A4:C15").values = [
  ["Signal", "Rule", "Points"], ["Ownership duration", "20–24 years", 20],
  ["Ownership duration", "25–34 years", 30], ["Ownership duration", "35+ years", 40],
  ["Absentee indicator", "Mailing address differs", 15], ["Out of state", "Mailing state is not AK", 20],
  ["Owner type", "Individual, estate, or trust", 10], ["Building age", "Built 1979 or earlier", 15],
  ["Building age", "Built 1980–1989 / 1990–1999", "10 / 5"],
  ["Portfolio bonus", "2 fourplex parcels", 5], ["Portfolio bonus", "3–4 fourplex parcels", 10],
  ["Portfolio bonus", "5+ fourplex parcels", 15],
];
rubric.getRange("A4:C4").format = { fill: teal, font: { bold: true, color: "#FFFFFF" } };
rubric.getRange("A5:C15").format.borders = { preset: "inside", style: "thin", color: "#D6E1E5" };
rubric.getRange("A:A").format.columnWidth = 25;
rubric.getRange("B:B").format.columnWidth = 39;
rubric.getRange("C:C").format.columnWidth = 14;
rubric.getRange("A17:C20").merge();
rubric.getRange("A17").values = [["Enhanced score = base property score + portfolio bonus, capped at 100. Portfolio counts include fourplex parcels in this MOA assessment layer only. Missing information earns no points, and normalized matches require review."]];
rubric.getRange("A17:C20").format = { fill: "#FFF8E1", wrapText: true, verticalAlignment: "top" };

const outputDir = outputPath.replace(/[\\/][^\\/]+$/, "");
await fs.mkdir(outputDir, { recursive: true });
const previewDir = `${outputDir}/previews`;
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of [["Summary", "A1:H16"], ["Prospects", "A1:L18"], ["All Fourplexes", "A1:L18"], ["Owner Portfolios", "A1:J18"], ["Scoring Rubric", "A1:C20"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${sheetName.replaceAll(" ", "_")}.png`, new Uint8Array(await preview.arrayBuffer()));
}
console.log((await workbook.inspect({ kind: "table", range: "Summary!A1:H16", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 10 })).ndjson);
console.log((await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" })).ndjson);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Saved ${outputPath}`);
