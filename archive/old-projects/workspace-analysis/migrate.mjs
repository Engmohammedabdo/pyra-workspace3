// Pyra Workspace Migration - Full Schema + Data Export & Import
import { readFileSync, writeFileSync } from 'fs';

// Load credentials
const envFile = readFileSync('/home/node/.openclaw/credentials/pyra-voice.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const eq = line.indexOf('=');
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
});

const OLD_URL = 'https://db.pyramedia.info';
const NEW_URL = 'https://pyraworkspacedb.pyramedia.cloud';
const OLD_KEY = env.SUPABASE_SERVICE_KEY;
const NEW_KEY = env.WORKSPACE_DB_SERVICE_KEY;
const OUT_DIR = '/home/node/openclaw/workspace-analysis';

const TABLES = [
  'pyra_users', 'pyra_sessions', 'pyra_login_attempts', 'pyra_blocked_logs',
  'pyra_settings', 'pyra_teams', 'pyra_team_members', 'pyra_file_index',
  'pyra_file_versions', 'pyra_file_permissions', 'pyra_favorites', 'pyra_reviews',
  'pyra_notifications', 'pyra_activity_log', 'pyra_share_links', 'pyra_trash',
  'pyra_clients', 'pyra_projects', 'pyra_project_files', 'pyra_file_approvals',
  'pyra_client_comments', 'pyra_client_notifications', 'pyra_client_password_resets'
];

async function pgQuery(url, key, sql) {
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  return res.json();
}

async function restGet(url, key, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=representation'
    }
  });
  return res.json();
}

function escapeSQL(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function mapDataType(col) {
  const udt = col.udt_name;
  const dt = col.data_type;
  const maxLen = col.character_maximum_length;
  
  // Check if it's a serial/identity type based on default
  const def = col.column_default || '';
  
  if (udt === 'int4') return 'INTEGER';
  if (udt === 'int8') return 'BIGINT';
  if (udt === 'int2') return 'SMALLINT';
  if (udt === 'float4') return 'REAL';
  if (udt === 'float8') return 'DOUBLE PRECISION';
  if (udt === 'bool') return 'BOOLEAN';
  if (udt === 'text') return 'TEXT';
  if (udt === 'varchar') return maxLen ? `VARCHAR(${maxLen})` : 'VARCHAR';
  if (udt === 'timestamptz') return 'TIMESTAMPTZ';
  if (udt === 'timestamp') return 'TIMESTAMP';
  if (udt === 'date') return 'DATE';
  if (udt === 'uuid') return 'UUID';
  if (udt === 'jsonb') return 'JSONB';
  if (udt === 'json') return 'JSON';
  if (udt === 'numeric') return 'NUMERIC';
  if (udt === '_text') return 'TEXT[]';
  if (udt === '_varchar') return 'VARCHAR[]';
  if (udt === '_int4') return 'INTEGER[]';
  if (dt === 'ARRAY') return `${udt.replace(/^_/, '')}[]`;
  if (dt === 'USER-DEFINED') return udt;
  return dt || udt;
}

async function main() {
  console.log('=== Pyra Workspace Migration ===\n');
  
  const allSchemas = {};
  const allData = {};
  const allConstraints = {};
  const allIndexes = {};
  const report = [];
  
  // Step 1: Export Schema
  console.log('--- Step 1: Export Schema ---');
  for (const tbl of TABLES) {
    process.stdout.write(`  ${tbl}... `);
    
    try {
      const columns = await pgQuery(OLD_URL, OLD_KEY, `
        SELECT c.column_name, c.data_type, c.column_default, c.is_nullable, 
               c.character_maximum_length, c.udt_name
        FROM information_schema.columns c 
        WHERE c.table_schema = 'public' AND c.table_name = '${tbl}'
        ORDER BY c.ordinal_position
      `);
      
      const constraints = await pgQuery(OLD_URL, OLD_KEY, `
        SELECT tc.constraint_name, tc.constraint_type, kcu.column_name,
               ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu 
          ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = '${tbl}'
      `);
      
      const indexes = await pgQuery(OLD_URL, OLD_KEY, `
        SELECT indexname, indexdef FROM pg_indexes 
        WHERE schemaname = 'public' AND tablename = '${tbl}'
      `);
      
      allSchemas[tbl] = columns;
      allConstraints[tbl] = constraints;
      allIndexes[tbl] = indexes;
      
      const colCount = Array.isArray(columns) ? columns.length : 0;
      console.log(`${colCount} columns`);
      
      if (colCount === 0) {
        console.log(`    WARNING: Table ${tbl} has no columns or doesn't exist!`);
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      allSchemas[tbl] = [];
      allConstraints[tbl] = [];
      allIndexes[tbl] = [];
    }
  }
  
  // Step 2: Export Data
  console.log('\n--- Step 2: Export Data ---');
  for (const tbl of TABLES) {
    process.stdout.write(`  ${tbl}... `);
    
    try {
      let allRows = [];
      let offset = 0;
      const limit = 1000;
      
      while (true) {
        const page = await restGet(OLD_URL, OLD_KEY, `${tbl}?select=*&offset=${offset}&limit=${limit}`);
        
        if (!Array.isArray(page) || page.length === 0) break;
        allRows = allRows.concat(page);
        if (page.length < limit) break;
        offset += limit;
      }
      
      allData[tbl] = allRows;
      console.log(`${allRows.length} rows`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      allData[tbl] = [];
    }
  }
  
  // Step 3: Generate SQL Script
  console.log('\n--- Step 3: Generate Migration SQL ---');
  
  // Determine table order based on foreign keys
  const fkDeps = {};
  for (const tbl of TABLES) {
    fkDeps[tbl] = new Set();
    const cons = allConstraints[tbl];
    if (Array.isArray(cons)) {
      for (const c of cons) {
        if (c.constraint_type === 'FOREIGN KEY' && c.foreign_table_name && c.foreign_table_name !== tbl) {
          fkDeps[tbl].add(c.foreign_table_name);
        }
      }
    }
  }
  
  // Topological sort
  const ordered = [];
  const visited = new Set();
  function visit(tbl) {
    if (visited.has(tbl)) return;
    visited.add(tbl);
    for (const dep of (fkDeps[tbl] || [])) {
      if (TABLES.includes(dep)) visit(dep);
    }
    ordered.push(tbl);
  }
  TABLES.forEach(visit);
  
  console.log('  Table order:', ordered.join(', '));
  
  let sql = `-- =============================================
-- Pyra Workspace — Full Migration Script
-- From: db.pyramedia.info
-- To: pyraworkspacedb.pyramedia.cloud
-- Date: 2026-02-15
-- =============================================

`;
  
  // Drop tables in reverse order
  sql += '-- 1. Drop tables (reverse dependency order)\n';
  for (const tbl of [...ordered].reverse()) {
    sql += `DROP TABLE IF EXISTS public.${tbl} CASCADE;\n`;
  }
  sql += '\n';
  
  // Create tables
  sql += '-- 2. Create tables\n';
  for (const tbl of ordered) {
    const cols = allSchemas[tbl];
    const cons = allConstraints[tbl];
    
    if (!Array.isArray(cols) || cols.length === 0) {
      sql += `-- SKIPPED: ${tbl} (no columns found)\n\n`;
      continue;
    }
    
    sql += `CREATE TABLE public.${tbl} (\n`;
    
    // Find PK columns
    const pkCols = new Set();
    const uniqueConstraints = {};
    const fkConstraints = {};
    const checkConstraints = new Set();
    
    if (Array.isArray(cons)) {
      for (const c of cons) {
        if (c.constraint_type === 'PRIMARY KEY') pkCols.add(c.column_name);
        if (c.constraint_type === 'UNIQUE') {
          if (!uniqueConstraints[c.constraint_name]) uniqueConstraints[c.constraint_name] = [];
          uniqueConstraints[c.constraint_name].push(c.column_name);
        }
        if (c.constraint_type === 'FOREIGN KEY') {
          fkConstraints[c.constraint_name] = c;
        }
      }
    }
    
    const colDefs = [];
    for (const col of cols) {
      let def = `  ${col.column_name}`;
      
      // Check for serial
      const colDefault = col.column_default || '';
      const isSerial = colDefault.includes("nextval(");
      
      if (isSerial && col.udt_name === 'int8') {
        def += ' BIGSERIAL';
      } else if (isSerial && (col.udt_name === 'int4' || col.udt_name === 'int2')) {
        def += ' SERIAL';
      } else {
        def += ` ${mapDataType(col)}`;
      }
      
      if (col.is_nullable === 'NO') def += ' NOT NULL';
      
      if (colDefault && !isSerial) {
        // Clean up default value
        let defaultVal = colDefault;
        // Remove type casts like ::text
        def += ` DEFAULT ${defaultVal}`;
      }
      
      colDefs.push(def);
    }
    
    // Add PK
    if (pkCols.size > 0) {
      colDefs.push(`  PRIMARY KEY (${[...pkCols].join(', ')})`);
    }
    
    // Add UNIQUE constraints
    for (const [name, ucols] of Object.entries(uniqueConstraints)) {
      const uniqueCols = [...new Set(ucols)];
      colDefs.push(`  CONSTRAINT ${name} UNIQUE (${uniqueCols.join(', ')})`);
    }
    
    // Add FK constraints
    for (const [name, fk] of Object.entries(fkConstraints)) {
      colDefs.push(`  CONSTRAINT ${name} FOREIGN KEY (${fk.column_name}) REFERENCES public.${fk.foreign_table_name}(${fk.foreign_column_name})`);
    }
    
    sql += colDefs.join(',\n');
    sql += '\n);\n\n';
  }
  
  // Create indexes (skip auto-generated PK/unique indexes)
  sql += '-- 3. Create indexes\n';
  for (const tbl of ordered) {
    const idxs = allIndexes[tbl];
    if (!Array.isArray(idxs)) continue;
    
    for (const idx of idxs) {
      // Skip primary key indexes and unique constraint indexes (already created)
      if (idx.indexname.endsWith('_pkey')) continue;
      
      // Check if this is a unique constraint index (already handled)
      const cons = allConstraints[tbl];
      const isConstraintIdx = Array.isArray(cons) && cons.some(c => 
        (c.constraint_type === 'UNIQUE' || c.constraint_type === 'PRIMARY KEY') && 
        c.constraint_name === idx.indexname
      );
      if (isConstraintIdx) continue;
      
      sql += `${idx.indexdef};\n`;
    }
  }
  sql += '\n';
  
  // Insert data
  sql += '-- 4. Insert data\n';
  for (const tbl of ordered) {
    const rows = allData[tbl];
    const cols = allSchemas[tbl];
    
    if (!Array.isArray(rows) || rows.length === 0) {
      sql += `-- ${tbl}: no data\n\n`;
      continue;
    }
    
    sql += `-- ${tbl}: ${rows.length} rows\n`;
    
    // Get column names from schema
    const colNames = cols.map(c => c.column_name);
    
    // Batch inserts (100 rows per statement)
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      sql += `INSERT INTO public.${tbl} (${colNames.join(', ')}) VALUES\n`;
      
      const valueSets = [];
      for (const row of batch) {
        const vals = colNames.map(col => escapeSQL(row[col]));
        valueSets.push(`(${vals.join(', ')})`);
      }
      sql += valueSets.join(',\n');
      sql += ';\n\n';
    }
  }
  
  // Save the SQL
  writeFileSync(`${OUT_DIR}/migration-script.sql`, sql);
  console.log(`  SQL saved: ${(sql.length / 1024).toFixed(1)} KB`);
  
  // Step 4: Execute on new database
  console.log('\n--- Step 4: Execute Migration on New DB ---');
  
  // 4a: Drop tables
  console.log('  Dropping existing tables...');
  let dropSQL = '';
  for (const tbl of [...ordered].reverse()) {
    dropSQL += `DROP TABLE IF EXISTS public.${tbl} CASCADE;\n`;
  }
  const dropResult = await pgQuery(NEW_URL, NEW_KEY, dropSQL);
  console.log('  Drop result:', JSON.stringify(dropResult).slice(0, 200));
  
  // 4b: Create tables one by one
  console.log('  Creating tables...');
  for (const tbl of ordered) {
    const cols = allSchemas[tbl];
    const cons = allConstraints[tbl];
    
    if (!Array.isArray(cols) || cols.length === 0) {
      console.log(`    SKIP ${tbl} (no schema)`);
      continue;
    }
    
    // Build CREATE TABLE
    let createSQL = `CREATE TABLE public.${tbl} (\n`;
    
    const pkCols = new Set();
    const uniqueConstraints = {};
    const fkConstraints = {};
    
    if (Array.isArray(cons)) {
      for (const c of cons) {
        if (c.constraint_type === 'PRIMARY KEY') pkCols.add(c.column_name);
        if (c.constraint_type === 'UNIQUE') {
          if (!uniqueConstraints[c.constraint_name]) uniqueConstraints[c.constraint_name] = [];
          uniqueConstraints[c.constraint_name].push(c.column_name);
        }
        if (c.constraint_type === 'FOREIGN KEY') {
          fkConstraints[c.constraint_name] = c;
        }
      }
    }
    
    const colDefs = [];
    for (const col of cols) {
      let def = `  ${col.column_name}`;
      const colDefault = col.column_default || '';
      const isSerial = colDefault.includes("nextval(");
      
      if (isSerial && col.udt_name === 'int8') {
        def += ' BIGSERIAL';
      } else if (isSerial) {
        def += ' SERIAL';
      } else {
        def += ` ${mapDataType(col)}`;
      }
      
      if (col.is_nullable === 'NO') def += ' NOT NULL';
      if (colDefault && !isSerial) def += ` DEFAULT ${colDefault}`;
      
      colDefs.push(def);
    }
    
    if (pkCols.size > 0) colDefs.push(`  PRIMARY KEY (${[...pkCols].join(', ')})`);
    for (const [name, ucols] of Object.entries(uniqueConstraints)) {
      colDefs.push(`  CONSTRAINT ${name} UNIQUE (${[...new Set(ucols)].join(', ')})`);
    }
    // FK constraints added later to avoid dependency issues
    
    createSQL += colDefs.join(',\n') + '\n);';
    
    const result = await pgQuery(NEW_URL, NEW_KEY, createSQL);
    const success = !result?.error && !result?.message?.includes('error');
    console.log(`    ${tbl}: ${success ? '✅' : '❌ ' + JSON.stringify(result).slice(0, 150)}`);
    
    report.push({
      table: tbl,
      columns: cols.length,
      rows: (allData[tbl] || []).length,
      createStatus: success ? 'OK' : JSON.stringify(result).slice(0, 100)
    });
  }
  
  // 4c: Add FK constraints
  console.log('  Adding foreign keys...');
  for (const tbl of ordered) {
    const cons = allConstraints[tbl];
    if (!Array.isArray(cons)) continue;
    
    const fkConstraints = {};
    for (const c of cons) {
      if (c.constraint_type === 'FOREIGN KEY') {
        fkConstraints[c.constraint_name] = c;
      }
    }
    
    for (const [name, fk] of Object.entries(fkConstraints)) {
      const fkSQL = `ALTER TABLE public.${tbl} ADD CONSTRAINT ${name} FOREIGN KEY (${fk.column_name}) REFERENCES public.${fk.foreign_table_name}(${fk.foreign_column_name});`;
      const result = await pgQuery(NEW_URL, NEW_KEY, fkSQL);
      const success = !result?.error && !result?.message?.includes('error');
      if (!success) {
        console.log(`    FK ${name} on ${tbl}: ❌ ${JSON.stringify(result).slice(0, 150)}`);
      }
    }
  }
  
  // 4d: Create indexes
  console.log('  Creating indexes...');
  for (const tbl of ordered) {
    const idxs = allIndexes[tbl];
    if (!Array.isArray(idxs)) continue;
    
    for (const idx of idxs) {
      if (idx.indexname.endsWith('_pkey')) continue;
      const cons = allConstraints[tbl];
      const isConstraintIdx = Array.isArray(cons) && cons.some(c => 
        (c.constraint_type === 'UNIQUE' || c.constraint_type === 'PRIMARY KEY') && 
        c.constraint_name === idx.indexname
      );
      if (isConstraintIdx) continue;
      
      const result = await pgQuery(NEW_URL, NEW_KEY, idx.indexdef + ';');
      const success = !result?.error && !result?.message?.includes('error');
      if (!success) {
        console.log(`    Index ${idx.indexname}: ❌ ${JSON.stringify(result).slice(0, 150)}`);
      }
    }
  }
  
  // 4e: Insert data
  console.log('  Inserting data...');
  for (const tbl of ordered) {
    const rows = allData[tbl];
    const cols = allSchemas[tbl];
    
    if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(cols) || cols.length === 0) {
      continue;
    }
    
    const colNames = cols.map(c => c.column_name);
    let insertedTotal = 0;
    let errors = [];
    
    // Batch inserts
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      let insertSQL = `INSERT INTO public.${tbl} (${colNames.join(', ')}) VALUES\n`;
      
      const valueSets = [];
      for (const row of batch) {
        const vals = colNames.map(col => escapeSQL(row[col]));
        valueSets.push(`(${vals.join(', ')})`);
      }
      insertSQL += valueSets.join(',\n') + ';';
      
      const result = await pgQuery(NEW_URL, NEW_KEY, insertSQL);
      if (result?.error || result?.message?.includes('error')) {
        errors.push(JSON.stringify(result).slice(0, 200));
        // Try row by row on failure
        for (const row of batch) {
          const vals = colNames.map(col => escapeSQL(row[col]));
          const singleSQL = `INSERT INTO public.${tbl} (${colNames.join(', ')}) VALUES (${vals.join(', ')});`;
          const sResult = await pgQuery(NEW_URL, NEW_KEY, singleSQL);
          if (!sResult?.error && !sResult?.message?.includes('error')) {
            insertedTotal++;
          }
        }
      } else {
        insertedTotal += batch.length;
      }
    }
    
    console.log(`    ${tbl}: ${insertedTotal}/${rows.length} rows ${insertedTotal === rows.length ? '✅' : '⚠️'}`);
    
    // Update report
    const rpt = report.find(r => r.table === tbl);
    if (rpt) {
      rpt.insertedRows = insertedTotal;
      rpt.insertStatus = insertedTotal === rows.length ? 'OK' : `${insertedTotal}/${rows.length}`;
      if (errors.length) rpt.errors = errors;
    }
    
    // Reset sequence if serial
    const serialCols = cols.filter(c => (c.column_default || '').includes('nextval('));
    for (const sc of serialCols) {
      const seqName = `${tbl}_${sc.column_name}_seq`;
      await pgQuery(NEW_URL, NEW_KEY, `SELECT setval('${seqName}', COALESCE((SELECT MAX(${sc.column_name}) FROM public.${tbl}), 1));`);
    }
  }
  
  // Step 5: Verification
  console.log('\n--- Step 5: Verification ---');
  for (const tbl of ordered) {
    const oldCount = (allData[tbl] || []).length;
    
    const newCountResult = await pgQuery(NEW_URL, NEW_KEY, `SELECT COUNT(*) as cnt FROM public.${tbl};`);
    let newCount = 0;
    if (Array.isArray(newCountResult) && newCountResult.length > 0) {
      newCount = parseInt(newCountResult[0].cnt || 0);
    }
    
    const match = oldCount === newCount;
    console.log(`  ${tbl}: old=${oldCount} new=${newCount} ${match ? '✅' : '❌ MISMATCH'}`);
    
    const rpt = report.find(r => r.table === tbl);
    if (rpt) {
      rpt.verifiedOld = oldCount;
      rpt.verifiedNew = newCount;
      rpt.verified = match;
    }
  }
  
  // Generate report
  console.log('\n--- Generating Report ---');
  let reportMd = `# Pyra Workspace Migration Report
## Date: 2026-02-15
## From: db.pyramedia.info → pyraworkspacedb.pyramedia.cloud

### Summary

| Table | Columns | Rows (Old) | Rows (New) | Create | Insert | Verified |
|-------|---------|------------|------------|--------|--------|----------|
`;
  
  for (const r of report) {
    reportMd += `| ${r.table} | ${r.columns} | ${r.verifiedOld || r.rows} | ${r.verifiedNew || '-'} | ${r.createStatus || '-'} | ${r.insertStatus || '-'} | ${r.verified ? '✅' : '❌'} |\n`;
  }
  
  // Tables that had no schema (didn't exist)
  const missing = TABLES.filter(t => !report.find(r => r.table === t));
  if (missing.length) {
    reportMd += `\n### Tables Not Found in Source DB\n`;
    missing.forEach(t => reportMd += `- ${t}\n`);
  }
  
  const errorTables = report.filter(r => r.errors);
  if (errorTables.length) {
    reportMd += `\n### Errors\n`;
    for (const r of errorTables) {
      reportMd += `\n#### ${r.table}\n`;
      r.errors.forEach(e => reportMd += `- ${e}\n`);
    }
  }
  
  reportMd += `\n### Verification\n`;
  const allVerified = report.every(r => r.verified);
  reportMd += allVerified 
    ? '✅ All tables verified successfully!\n' 
    : '⚠️ Some tables have mismatches - check details above.\n';
  
  writeFileSync(`${OUT_DIR}/migration-report.md`, reportMd);
  console.log(`Report saved to ${OUT_DIR}/migration-report.md`);
  console.log('\n=== Migration Complete ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
