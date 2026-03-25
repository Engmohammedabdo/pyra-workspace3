#!/usr/bin/env node
/**
 * n8n Node Lookup Tool
 * Query n8n-mcp database for node documentation
 * 
 * Usage:
 *   node n8n-lookup.js search <query>
 *   node n8n-lookup.js node <node-type>
 *   node n8n-lookup.js props <node-type>
 *   node n8n-lookup.js templates <query>
 */

const DB_PATH = '/home/node/.npm/_npx/b6a381d62ce0fe56/node_modules/n8n-mcp/data/nodes.db';

let Database;
try {
  Database = require('/home/node/.npm/_npx/b6a381d62ce0fe56/node_modules/better-sqlite3');
} catch (e) {
  console.error('Error: better-sqlite3 not found. Run: npx n8n-mcp first');
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

const command = process.argv[2];
const query = process.argv.slice(3).join(' ');

switch (command) {
  case 'search':
    // Search nodes by keyword
    const nodes = db.prepare(`
      SELECT node_type, display_name, description, is_trigger, is_ai_tool 
      FROM nodes 
      WHERE node_type LIKE ? OR display_name LIKE ? OR description LIKE ?
      LIMIT 20
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
    
    console.log(`Found ${nodes.length} nodes matching "${query}":\n`);
    nodes.forEach(n => {
      const flags = [];
      if (n.is_trigger) flags.push('trigger');
      if (n.is_ai_tool) flags.push('ai-tool');
      console.log(`  ${n.node_type}`);
      console.log(`    ${n.display_name} ${flags.length ? '[' + flags.join(', ') + ']' : ''}`);
      console.log(`    ${n.description?.substring(0, 100) || 'No description'}...`);
      console.log();
    });
    break;
    
  case 'node':
    // Get node details
    const node = db.prepare(`SELECT * FROM nodes WHERE node_type LIKE ?`).get(`%${query}%`);
    if (node) {
      console.log('='.repeat(60));
      console.log(`${node.display_name} (${node.node_type})`);
      console.log('='.repeat(60));
      console.log(`Version: ${node.version}`);
      console.log(`Trigger: ${node.is_trigger ? 'Yes' : 'No'}`);
      console.log(`AI Tool: ${node.is_ai_tool ? 'Yes' : 'No'}`);
      console.log(`\nDescription:\n${node.description}`);
      if (node.documentation) {
        console.log(`\nDocumentation (first 2000 chars):\n${node.documentation.substring(0, 2000)}`);
      }
      if (node.operations) {
        const ops = JSON.parse(node.operations);
        console.log(`\nOperations: ${ops.map(o => o.name || o.value).join(', ')}`);
      }
    } else {
      console.log(`Node "${query}" not found`);
    }
    break;
    
  case 'props':
    // Get node properties schema
    const nodeProps = db.prepare(`SELECT node_type, display_name, properties_schema FROM nodes WHERE node_type LIKE ?`).get(`%${query}%`);
    if (nodeProps && nodeProps.properties_schema) {
      console.log(`Properties for ${nodeProps.display_name}:\n`);
      const props = JSON.parse(nodeProps.properties_schema);
      props.slice(0, 20).forEach(p => {
        console.log(`  ${p.name} (${p.type})`);
        console.log(`    Display: ${p.displayName}`);
        console.log(`    Default: ${JSON.stringify(p.default)}`);
        if (p.options) {
          console.log(`    Options: ${p.options.map(o => o.value || o.name).join(', ')}`);
        }
        console.log();
      });
    } else {
      console.log(`Node "${query}" not found or has no properties`);
    }
    break;
    
  case 'templates':
    // Search templates
    const templates = db.prepare(`
      SELECT id, name, description, total_views, node_count, created_at
      FROM templates
      WHERE name LIKE ? OR description LIKE ?
      ORDER BY total_views DESC
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`);
    
    console.log(`Found ${templates.length} templates matching "${query}":\n`);
    templates.forEach(t => {
      console.log(`  [${t.id}] ${t.name}`);
      console.log(`    Views: ${t.total_views} | Nodes: ${t.node_count}`);
      console.log(`    ${t.description?.substring(0, 100) || 'No description'}...`);
      console.log();
    });
    break;
    
  default:
    console.log(`
n8n Node Lookup Tool

Usage:
  node n8n-lookup.js search <query>     Search nodes by keyword
  node n8n-lookup.js node <node-type>   Get node details
  node n8n-lookup.js props <node-type>  Get node properties schema
  node n8n-lookup.js templates <query>  Search workflow templates
  
Examples:
  node n8n-lookup.js search supabase
  node n8n-lookup.js node nodes-base.set
  node n8n-lookup.js props nodes-base.httpRequest
  node n8n-lookup.js templates slack notification
`);
}

db.close();
