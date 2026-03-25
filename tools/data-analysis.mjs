#!/usr/bin/env node
/**
 * Data Analysis Tool — ExcelJS + Arquero
 * 
 * Capabilities:
 *   - Read/Write Excel with RTL/Arabic support
 *   - CSV ↔ Excel conversion
 *   - Data analysis (summary stats, group-by, top/bottom N)
 *   - Report generation
 * 
 * CLI:
 *   node data-analysis.mjs analyze <file.xlsx> [--group-by col] [--top N]
 *   node data-analysis.mjs summary <file.xlsx>
 *   node data-analysis.mjs convert <input.csv> <output.xlsx>
 *   node data-analysis.mjs report <file.xlsx> <output.xlsx>
 */

import ExcelJS from 'exceljs';
import * as aq from 'arquero';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';

// ─── 1. Read Excel ───────────────────────────────────────────────────────────

export async function readExcel(filePath, { sheet = 0 } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(filePath));

  const ws = typeof sheet === 'number' ? workbook.worksheets[sheet] : workbook.getWorksheet(sheet);
  if (!ws) throw new Error(`Sheet "${sheet}" not found`);

  const headers = [];
  const rows = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      row.eachCell((cell, colNum) => {
        headers[colNum - 1] = String(cell.value ?? `col_${colNum}`);
      });
    } else {
      const obj = {};
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const key = headers[colNum - 1] || `col_${colNum}`;
        obj[key] = cell.value;
      });
      // Fill missing headers with null
      for (const h of headers) {
        if (!(h in obj)) obj[h] = null;
      }
      rows.push(obj);
    }
  });

  return { headers, rows, sheetName: ws.name };
}

// ─── 2. Write Excel ──────────────────────────────────────────────────────────

export async function writeExcel(data, filePath, options = {}) {
  const {
    sheetName = 'Sheet1',
    rtl = false,
    headerColor = 'FF4472C4',   // Blue
    headerFontColor = 'FFFFFFFF',
    freezeHeader = true,
    autoFilter = true,
  } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PyraAI Data Analysis';
  workbook.created = new Date();

  const ws = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: rtl, state: 'frozen', ySplit: freezeHeader ? 1 : 0 }],
  });

  if (!data.length) {
    await workbook.xlsx.writeFile(resolve(filePath));
    return filePath;
  }

  const headers = Object.keys(data[0]);
  
  // Add header row
  ws.columns = headers.map(h => ({ header: h, key: h }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: headerFontColor }, size: 12 };
  headerRow.fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: headerColor },
  };
  headerRow.alignment = { horizontal: rtl ? 'right' : 'left', vertical: 'middle' };
  headerRow.height = 25;

  // Add data rows
  for (const row of data) {
    ws.addRow(row);
  }

  // Auto-width columns
  for (const col of ws.columns) {
    let maxLen = String(col.header ?? '').length;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.max(maxLen + 4, 10), 50);
  }

  // Auto-filter
  if (autoFilter && headers.length) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: data.length + 1, column: headers.length },
    };
  }

  await workbook.xlsx.writeFile(resolve(filePath));
  return filePath;
}

// ─── 3. Analyze Data ─────────────────────────────────────────────────────────

export function analyzeData(data, options = {}) {
  const { groupBy, topN = 5, bottomN = 5 } = options;

  if (!data.length) return { error: 'No data to analyze' };

  const dt = aq.from(data);
  const headers = Object.keys(data[0]);

  // Detect column types
  const numericCols = [];
  const textCols = [];
  for (const h of headers) {
    const sample = data.find(r => r[h] != null)?.[h];
    if (typeof sample === 'number' || (typeof sample === 'string' && !isNaN(Number(sample)) && sample.trim() !== '')) {
      numericCols.push(h);
    } else {
      textCols.push(h);
    }
  }

  // Summary stats for numeric columns
  const summaryStats = {};
  for (const col of numericCols) {
    const values = data.map(r => Number(r[col])).filter(v => !isNaN(v));
    if (!values.length) continue;
    const sorted = [...values].sort((a, b) => a - b);
    summaryStats[col] = {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      avg: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted.length % 2 === 0
        ? +((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(2)
        : sorted[Math.floor(sorted.length / 2)],
    };
  }

  // Missing values
  const missingValues = {};
  for (const h of headers) {
    const missing = data.filter(r => r[h] == null || r[h] === '' || r[h] === undefined).length;
    if (missing > 0) missingValues[h] = missing;
  }

  // Top/Bottom N (first numeric column)
  let topBottom = null;
  if (numericCols.length) {
    const sortCol = numericCols[0];
    const sorted = [...data].sort((a, b) => Number(b[sortCol]) - Number(a[sortCol]));
    topBottom = {
      column: sortCol,
      top: sorted.slice(0, topN),
      bottom: sorted.slice(-bottomN).reverse(),
    };
  }

  // Group-by aggregation
  let groupByResult = null;
  if (groupBy && headers.includes(groupBy)) {
    const groups = {};
    for (const row of data) {
      const key = String(row[groupBy] ?? 'N/A');
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    groupByResult = {};
    for (const [key, rows] of Object.entries(groups)) {
      groupByResult[key] = { count: rows.length };
      for (const col of numericCols) {
        if (col === groupBy) continue;
        const vals = rows.map(r => Number(r[col])).filter(v => !isNaN(v));
        if (vals.length) {
          groupByResult[key][col] = {
            sum: +(vals.reduce((a, b) => a + b, 0)).toFixed(2),
            avg: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
          };
        }
      }
    }
  }

  return {
    totalRows: data.length,
    totalColumns: headers.length,
    numericColumns: numericCols,
    textColumns: textCols,
    summaryStats,
    missingValues: Object.keys(missingValues).length ? missingValues : 'None',
    topBottom,
    groupBy: groupByResult,
  };
}

// ─── 4. Filter Data ──────────────────────────────────────────────────────────

export function filterData(data, conditions) {
  // conditions: array of { column, op, value }
  // ops: eq, neq, gt, gte, lt, lte, contains, startsWith, endsWith
  return data.filter(row => {
    return conditions.every(({ column, op, value }) => {
      const v = row[column];
      switch (op) {
        case 'eq': return v == value;
        case 'neq': return v != value;
        case 'gt': return Number(v) > Number(value);
        case 'gte': return Number(v) >= Number(value);
        case 'lt': return Number(v) < Number(value);
        case 'lte': return Number(v) <= Number(value);
        case 'contains': return String(v).includes(String(value));
        case 'startsWith': return String(v).startsWith(String(value));
        case 'endsWith': return String(v).endsWith(String(value));
        default: return true;
      }
    });
  });
}

// ─── 5. CSV to Excel ─────────────────────────────────────────────────────────

export async function csvToExcel(csvPath, excelPath, options = {}) {
  const content = readFileSync(resolve(csvPath), 'utf-8');
  const lines = content.trim().split('\n');
  if (!lines.length) throw new Error('Empty CSV');

  // Simple CSV parser (handles commas in quotes)
  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      const v = vals[idx] ?? '';
      obj[h] = isNaN(Number(v)) || v === '' ? v : Number(v);
    });
    data.push(obj);
  }

  await writeExcel(data, excelPath, options);
  return { rows: data.length, columns: headers.length, outputPath: excelPath };
}

// ─── 6. Create Report ────────────────────────────────────────────────────────

export async function createReport(data, outputPath, options = {}) {
  const { title = 'Data Report', rtl = false } = options;

  const analysis = analyzeData(data, options);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PyraAI Data Analysis';
  workbook.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
    alignment: { horizontal: rtl ? 'right' : 'left', vertical: 'middle' },
  };

  // ── Summary Sheet ──
  const summary = workbook.addWorksheet('Summary', {
    views: [{ rightToLeft: rtl }],
  });

  summary.mergeCells('A1:D1');
  const titleCell = summary.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF2F5496' } };
  titleCell.alignment = { horizontal: 'center' };

  summary.getCell('A3').value = 'Metric';
  summary.getCell('B3').value = 'Value';
  Object.assign(summary.getCell('A3'), headerStyle);
  Object.assign(summary.getCell('B3'), headerStyle);

  let row = 4;
  summary.getCell(`A${row}`).value = 'Total Rows'; summary.getCell(`B${row}`).value = analysis.totalRows; row++;
  summary.getCell(`A${row}`).value = 'Total Columns'; summary.getCell(`B${row}`).value = analysis.totalColumns; row++;
  summary.getCell(`A${row}`).value = 'Numeric Columns'; summary.getCell(`B${row}`).value = analysis.numericColumns.join(', '); row++;
  summary.getCell(`A${row}`).value = 'Text Columns'; summary.getCell(`B${row}`).value = analysis.textColumns.join(', '); row++;

  // Stats per numeric column
  row += 1;
  for (const [col, stats] of Object.entries(analysis.summaryStats)) {
    summary.getCell(`A${row}`).value = `── ${col} ──`;
    summary.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF2F5496' } };
    row++;
    for (const [k, v] of Object.entries(stats)) {
      summary.getCell(`A${row}`).value = `  ${k}`;
      summary.getCell(`B${row}`).value = v;
      row++;
    }
  }

  summary.getColumn(1).width = 25;
  summary.getColumn(2).width = 20;

  // ── Data Sheet ──
  const dataSheet = workbook.addWorksheet('Data', {
    views: [{ rightToLeft: rtl, state: 'frozen', ySplit: 1 }],
  });

  if (data.length) {
    const headers = Object.keys(data[0]);
    dataSheet.columns = headers.map(h => ({ header: h, key: h }));

    const hRow = dataSheet.getRow(1);
    hRow.font = headerStyle.font;
    hRow.fill = headerStyle.fill;
    hRow.alignment = headerStyle.alignment;
    hRow.height = 25;

    for (const r of data) dataSheet.addRow(r);

    for (const col of dataSheet.columns) {
      let maxLen = String(col.header ?? '').length;
      col.eachCell({ includeEmpty: false }, c => {
        const l = String(c.value ?? '').length;
        if (l > maxLen) maxLen = l;
      });
      col.width = Math.min(Math.max(maxLen + 4, 10), 50);
    }

    dataSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: data.length + 1, column: headers.length },
    };
  }

  // ── Charts Data Sheet (for group-by) ──
  if (analysis.groupBy) {
    const chartSheet = workbook.addWorksheet('Charts Data', {
      views: [{ rightToLeft: rtl }],
    });

    const groups = Object.entries(analysis.groupBy);
    const numCols = analysis.numericColumns.filter(c => c !== options.groupBy);

    // Header
    chartSheet.getCell('A1').value = options.groupBy || 'Group';
    chartSheet.getCell('A1').font = headerStyle.font;
    chartSheet.getCell('A1').fill = headerStyle.fill;

    let colIdx = 2;
    for (const nc of numCols) {
      const cell = chartSheet.getCell(1, colIdx);
      cell.value = `${nc} (Sum)`;
      Object.assign(cell, { font: headerStyle.font, fill: headerStyle.fill });
      colIdx++;
      const cell2 = chartSheet.getCell(1, colIdx);
      cell2.value = `${nc} (Avg)`;
      Object.assign(cell2, { font: headerStyle.font, fill: headerStyle.fill });
      colIdx++;
    }

    let r = 2;
    for (const [key, vals] of groups) {
      chartSheet.getCell(r, 1).value = key;
      let ci = 2;
      for (const nc of numCols) {
        chartSheet.getCell(r, ci).value = vals[nc]?.sum ?? '';
        ci++;
        chartSheet.getCell(r, ci).value = vals[nc]?.avg ?? '';
        ci++;
      }
      r++;
    }

    // Auto-width
    for (const col of chartSheet.columns) {
      let maxLen = 10;
      col.eachCell({ includeEmpty: false }, c => {
        const l = String(c.value ?? '').length;
        if (l > maxLen) maxLen = l;
      });
      col.width = Math.min(maxLen + 4, 40);
    }
  }

  await workbook.xlsx.writeFile(resolve(outputPath));
  return { outputPath, analysis };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function cli() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Data Analysis Tool — ExcelJS + Arquero

Usage:
  node data-analysis.mjs analyze <file>   [--group-by <col>] [--top <N>]
  node data-analysis.mjs summary <file>
  node data-analysis.mjs convert <input.csv> [output.xlsx]
  node data-analysis.mjs report <file> [output.xlsx] [--group-by <col>] [--title <t>] [--rtl]
  node data-analysis.mjs filter <file> <col> <op> <value>
    `);
    return;
  }

  const flagIdx = (flag) => args.indexOf(flag);
  const flagVal = (flag) => { const i = flagIdx(flag); return i >= 0 ? args[i + 1] : undefined; };
  const hasFlag = (flag) => args.includes(flag);

  try {
    switch (command) {
      case 'analyze':
      case 'summary': {
        const file = args[1];
        if (!file) { console.error('Missing file path'); process.exit(1); }
        const { rows } = await readExcel(file);
        const result = analyzeData(rows, {
          groupBy: flagVal('--group-by'),
          topN: Number(flagVal('--top') || 5),
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'convert': {
        const input = args[1];
        const output = args[2] || input.replace(/\.csv$/i, '.xlsx');
        if (!input) { console.error('Missing input file'); process.exit(1); }
        const result = await csvToExcel(input, output, { rtl: hasFlag('--rtl') });
        console.log(`✅ Converted: ${result.rows} rows, ${result.columns} cols → ${result.outputPath}`);
        break;
      }

      case 'report': {
        const file = args[1];
        const output = args[2] || file.replace(/\.\w+$/, '-report.xlsx');
        if (!file) { console.error('Missing file path'); process.exit(1); }
        const { rows } = await readExcel(file);
        const result = await createReport(rows, output, {
          groupBy: flagVal('--group-by'),
          title: flagVal('--title') || 'Data Report',
          rtl: hasFlag('--rtl'),
        });
        console.log(`✅ Report generated: ${result.outputPath}`);
        console.log(JSON.stringify(result.analysis, null, 2));
        break;
      }

      case 'filter': {
        const file = args[1];
        const col = args[2], op = args[3], val = args[4];
        if (!file || !col || !op) { console.error('Usage: filter <file> <col> <op> <value>'); process.exit(1); }
        const { rows } = await readExcel(file);
        const filtered = filterData(rows, [{ column: col, op, value: val }]);
        console.log(`Filtered: ${filtered.length}/${rows.length} rows`);
        console.log(JSON.stringify(filtered, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) cli();
