#!/usr/bin/env node
/**
 * Test suite for data-analysis.mjs with Arabic sample data
 */

import { readExcel, writeExcel, analyzeData, filterData, csvToExcel, createReport } from './data-analysis.mjs';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const TEMP = '/tmp/data-analysis-test';
const passed = [];
const failed = [];

function assert(condition, name) {
  if (condition) { passed.push(name); console.log(`  ✅ ${name}`); }
  else { failed.push(name); console.log(`  ❌ ${name}`); }
}

// Sample Arabic sales data
const sampleData = [
  { 'الاسم': 'أحمد محمد', 'القسم': 'مبيعات', 'المبلغ': 15000, 'الكمية': 30, 'المدينة': 'دبي' },
  { 'الاسم': 'فاطمة علي', 'القسم': 'تسويق', 'المبلغ': 22000, 'الكمية': 45, 'المدينة': 'أبوظبي' },
  { 'الاسم': 'خالد حسن', 'القسم': 'مبيعات', 'المبلغ': 18500, 'الكمية': 37, 'المدينة': 'الشارقة' },
  { 'الاسم': 'نورة سعيد', 'القسم': 'تسويق', 'المبلغ': 9000, 'الكمية': 18, 'المدينة': 'دبي' },
  { 'الاسم': 'محمد عبدالله', 'القسم': 'مبيعات', 'المبلغ': 31000, 'الكمية': 62, 'المدينة': 'أبوظبي' },
  { 'الاسم': 'ليلى أحمد', 'القسم': 'دعم', 'المبلغ': 12000, 'الكمية': 24, 'المدينة': 'دبي' },
  { 'الاسم': 'عمر خالد', 'القسم': 'مبيعات', 'المبلغ': 27500, 'الكمية': 55, 'المدينة': 'عجمان' },
  { 'الاسم': 'سارة يوسف', 'القسم': 'تسويق', 'المبلغ': null, 'الكمية': 40, 'المدينة': 'دبي' },
];

async function runTests() {
  console.log('\n🧪 Data Analysis Tool — Test Suite\n');

  // ── Test 1: Write Arabic RTL Excel ──
  console.log('📝 Test 1: Write RTL Excel with Arabic headers');
  const excelPath = `${TEMP}-arabic.xlsx`;
  try {
    await writeExcel(sampleData, excelPath, { rtl: true, sheetName: 'تقرير المبيعات' });
    assert(existsSync(excelPath), 'Excel file created');
  } catch (e) {
    assert(false, `Write Excel: ${e.message}`);
  }

  // ── Test 2: Read Arabic Excel ──
  console.log('\n📖 Test 2: Read Arabic Excel');
  try {
    const { headers, rows, sheetName } = await readExcel(excelPath);
    assert(headers.includes('الاسم'), 'Arabic header "الاسم" found');
    assert(headers.includes('المبلغ'), 'Arabic header "المبلغ" found');
    assert(rows.length === 8, `Row count = ${rows.length} (expected 8)`);
    assert(sheetName === 'تقرير المبيعات', `Sheet name = "${sheetName}"`);
    assert(rows[0]['الاسم'] === 'أحمد محمد', 'First row data correct');
  } catch (e) {
    assert(false, `Read Excel: ${e.message}`);
  }

  // ── Test 3: Analyze Data ──
  console.log('\n📊 Test 3: Analyze Data');
  const analysis = analyzeData(sampleData);
  assert(analysis.totalRows === 8, `Total rows = ${analysis.totalRows}`);
  assert(analysis.numericColumns.includes('المبلغ'), 'Detected "المبلغ" as numeric');
  assert(analysis.numericColumns.includes('الكمية'), 'Detected "الكمية" as numeric');
  assert(analysis.summaryStats['الكمية']?.count === 8, 'الكمية count = 8');
  assert(analysis.summaryStats['الكمية']?.avg === 38.88, `الكمية avg = ${analysis.summaryStats['الكمية']?.avg}`);
  assert(typeof analysis.missingValues === 'object' && analysis.missingValues['المبلغ'] === 1, 'Detected 1 missing value in المبلغ');
  assert(analysis.topBottom != null, 'Top/Bottom N generated');

  // ── Test 4: Analyze with Group-By ──
  console.log('\n📊 Test 4: Group-by Analysis');
  const grouped = analyzeData(sampleData, { groupBy: 'القسم' });
  assert(grouped.groupBy != null, 'Group-by result exists');
  assert(grouped.groupBy['مبيعات']?.count === 4, `مبيعات count = ${grouped.groupBy['مبيعات']?.count}`);
  assert(grouped.groupBy['تسويق']?.count === 3, `تسويق count = ${grouped.groupBy['تسويق']?.count}`);
  assert(grouped.groupBy['دعم']?.count === 1, `دعم count = ${grouped.groupBy['دعم']?.count}`);

  // ── Test 5: Filter Data ──
  console.log('\n🔍 Test 5: Filter Data');
  const filtered = filterData(sampleData, [{ column: 'المبلغ', op: 'gt', value: 20000 }]);
  assert(filtered.length === 3, `Filtered rows (المبلغ > 20000) = ${filtered.length}`);
  const filtered2 = filterData(sampleData, [{ column: 'المدينة', op: 'eq', value: 'دبي' }]);
  assert(filtered2.length === 4, `Filtered rows (المدينة = دبي) = ${filtered2.length}`);

  // ── Test 6: CSV to Excel ──
  console.log('\n🔄 Test 6: CSV to Excel Conversion');
  const csvPath = `${TEMP}-test.csv`;
  const csvExcelPath = `${TEMP}-from-csv.xlsx`;
  writeFileSync(csvPath, `الاسم,العمر,المدينة,الراتب
أحمد,30,دبي,25000
فاطمة,25,أبوظبي,22000
خالد,35,الشارقة,30000
نورة,28,دبي,18000`);
  try {
    const result = await csvToExcel(csvPath, csvExcelPath, { rtl: true });
    assert(result.rows === 4, `CSV rows = ${result.rows}`);
    assert(result.columns === 4, `CSV columns = ${result.columns}`);
    // Verify by reading back
    const { rows: csvRows } = await readExcel(csvExcelPath);
    assert(csvRows[0]['الاسم'] === 'أحمد', 'CSV→Excel Arabic data preserved');
    assert(csvRows[2]['الراتب'] === 30000, `CSV→Excel numeric = ${csvRows[2]['الراتب']}`);
  } catch (e) {
    assert(false, `CSV conversion: ${e.message}`);
  }

  // ── Test 7: Create Report ──
  console.log('\n📋 Test 7: Create Report');
  const reportPath = `${TEMP}-report.xlsx`;
  try {
    const result = await createReport(sampleData, reportPath, {
      title: 'تقرير المبيعات الشهري',
      rtl: true,
      groupBy: 'القسم',
    });
    assert(existsSync(reportPath), 'Report file created');
    assert(result.analysis.totalRows === 8, 'Report analysis correct');

    // Verify report has multiple sheets
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(reportPath);
    const sheetNames = wb.worksheets.map(s => s.name);
    assert(sheetNames.includes('Summary'), 'Report has Summary sheet');
    assert(sheetNames.includes('Data'), 'Report has Data sheet');
    assert(sheetNames.includes('Charts Data'), 'Report has Charts Data sheet');
  } catch (e) {
    assert(false, `Create Report: ${e.message}`);
  }

  // ── Test 8: CLI (summary command) ──
  console.log('\n🖥️ Test 8: CLI summary command');
  try {
    const { execSync } = await import('child_process');
    const output = execSync(`node /home/node/openclaw/tools/data-analysis.mjs summary "${excelPath}"`, { encoding: 'utf-8' });
    const json = JSON.parse(output);
    assert(json.totalRows === 8, `CLI summary totalRows = ${json.totalRows}`);
    assert(json.numericColumns.length >= 2, 'CLI detected numeric columns');
  } catch (e) {
    assert(false, `CLI test: ${e.message}`);
  }

  // ── Cleanup ──
  for (const f of [excelPath, csvPath, csvExcelPath, reportPath]) {
    try { if (existsSync(f)) unlinkSync(f); } catch {}
  }

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Passed: ${passed.length}  ❌ Failed: ${failed.length}  Total: ${passed.length + failed.length}`);
  if (failed.length) {
    console.log('\nFailed tests:');
    failed.forEach(f => console.log(`  ❌ ${f}`));
  }
  console.log();

  process.exit(failed.length ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
