# Data Analysis Tool 📊

ExcelJS + Arquero-based data analysis module with full Arabic/RTL support.

## Installation

Already installed in `/home/node/openclaw`:
- `exceljs` — Excel read/write with formatting
- `arquero` — Data manipulation (available for advanced queries)

## Usage

### CLI

```bash
# Analyze an Excel file (summary stats, missing values, top/bottom N)
node tools/data-analysis.mjs analyze data.xlsx

# With group-by aggregation
node tools/data-analysis.mjs analyze data.xlsx --group-by "القسم" --top 10

# Quick summary (alias for analyze)
node tools/data-analysis.mjs summary data.xlsx

# Convert CSV to formatted Excel
node tools/data-analysis.mjs convert data.csv output.xlsx --rtl

# Generate multi-sheet report
node tools/data-analysis.mjs report data.xlsx report.xlsx --group-by "القسم" --title "تقرير شهري" --rtl

# Filter data
node tools/data-analysis.mjs filter data.xlsx "المبلغ" gt 20000
```

### Programmatic (ESM)

```javascript
import { readExcel, writeExcel, analyzeData, filterData, csvToExcel, createReport } from './tools/data-analysis.mjs';

// Read Excel
const { headers, rows } = await readExcel('file.xlsx');

// Write with RTL + styling
await writeExcel(data, 'output.xlsx', { rtl: true, sheetName: 'بيانات' });

// Analyze
const stats = analyzeData(rows, { groupBy: 'القسم', topN: 10 });

// Filter
const filtered = filterData(rows, [{ column: 'المبلغ', op: 'gt', value: 20000 }]);

// CSV → Excel
await csvToExcel('data.csv', 'data.xlsx', { rtl: true });

// Full report (Summary + Data + Charts Data sheets)
await createReport(rows, 'report.xlsx', { title: 'تقرير', rtl: true, groupBy: 'القسم' });
```

## Features

| Feature | Details |
|---------|---------|
| **Read Excel** | Any sheet, auto-detect headers |
| **Write Excel** | RTL, auto-width, header styling, freeze panes, auto-filter |
| **Analyze** | Count, sum, avg, min, max, median per numeric column |
| **Group-by** | Aggregate by any column (sum + avg per group) |
| **Top/Bottom N** | Sorted by first numeric column |
| **Missing values** | Auto-detected per column |
| **Filter** | eq, neq, gt, gte, lt, lte, contains, startsWith, endsWith |
| **CSV → Excel** | With number auto-detection and formatting |
| **Report** | Multi-sheet: Summary, Data, Charts Data |
| **Arabic/RTL** | Full support for Arabic headers, data, and RTL layout |

## Test Results

**30/30 tests passed** ✅ (2026-02-21)

- ✅ Write RTL Excel with Arabic headers
- ✅ Read Arabic Excel (headers, data, sheet name)
- ✅ Summary stats (count, sum, avg, min, max, median)
- ✅ Group-by aggregation (مبيعات, تسويق, دعم)
- ✅ Missing value detection (null values)
- ✅ Filter by numeric and text conditions
- ✅ CSV → Excel conversion with Arabic data
- ✅ Multi-sheet report generation (Summary, Data, Charts Data)
- ✅ CLI commands working
