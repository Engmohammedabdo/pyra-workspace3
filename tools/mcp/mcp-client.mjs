#!/usr/bin/env node
/**
 * PyraAI MCP Client — Universal MCP Server Bridge
 * 
 * Connects to any MCP server via stdio transport,
 * lists available tools, and calls them.
 * 
 * Usage:
 *   node mcp-client.mjs list-servers
 *   node mcp-client.mjs list-tools <server-name>
 *   node mcp-client.mjs call <server-name> <tool-name> [json-params]
 *   node mcp-client.mjs add-server <name> <command> [args...]
 *   node mcp-client.mjs remove-server <name>
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'mcp-servers.json');

// ─── Config Management ───

async function loadConfig() {
  try {
    const data = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { servers: {} };
  }
}

async function saveConfig(config) {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── MCP Client Connection ───

async function connectToServer(serverConfig) {
  const { command, args = [], env = {} } = serverConfig;
  
  const mergedEnv = { ...process.env, ...env };
  
  const transport = new StdioClientTransport({
    command,
    args,
    env: mergedEnv,
  });

  const client = new Client({
    name: 'pyraai-mcp-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  return { client, transport };
}

// ─── Commands ───

async function listServers() {
  const config = await loadConfig();
  const servers = Object.entries(config.servers);
  
  if (servers.length === 0) {
    console.log('No MCP servers configured.');
    console.log('Add one with: node mcp-client.mjs add-server <name> <command> [args...]');
    return;
  }

  console.log(`\n📡 MCP Servers (${servers.length}):\n`);
  for (const [name, cfg] of servers) {
    console.log(`  ${name}`);
    console.log(`    Command: ${cfg.command} ${(cfg.args || []).join(' ')}`);
    if (cfg.description) console.log(`    Description: ${cfg.description}`);
    console.log();
  }
}

async function listTools(serverName) {
  const config = await loadConfig();
  const serverConfig = config.servers[serverName];
  
  if (!serverConfig) {
    console.error(`❌ Server "${serverName}" not found. Use 'list-servers' to see available servers.`);
    process.exit(1);
  }

  let client, transport;
  try {
    ({ client, transport } = await connectToServer(serverConfig));
    
    const { tools } = await client.listTools();
    
    console.log(`\n🔧 Tools from "${serverName}" (${tools.length}):\n`);
    for (const tool of tools) {
      console.log(`  ${tool.name}`);
      if (tool.description) console.log(`    ${tool.description}`);
      if (tool.inputSchema?.properties) {
        const params = Object.entries(tool.inputSchema.properties);
        if (params.length > 0) {
          console.log(`    Parameters:`);
          for (const [pName, pSchema] of params) {
            const required = tool.inputSchema.required?.includes(pName) ? ' (required)' : '';
            console.log(`      - ${pName}: ${pSchema.type || 'any'}${required} — ${pSchema.description || ''}`);
          }
        }
      }
      console.log();
    }
    
    // Also output as JSON for programmatic use
    if (process.env.MCP_JSON_OUTPUT) {
      console.log('\n---JSON---');
      console.log(JSON.stringify(tools, null, 2));
    }
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

async function callTool(serverName, toolName, paramsStr) {
  const config = await loadConfig();
  const serverConfig = config.servers[serverName];
  
  if (!serverConfig) {
    console.error(`❌ Server "${serverName}" not found.`);
    process.exit(1);
  }

  let params = {};
  if (paramsStr) {
    try {
      params = JSON.parse(paramsStr);
    } catch (e) {
      console.error(`❌ Invalid JSON params: ${e.message}`);
      process.exit(1);
    }
  }

  let client, transport;
  try {
    ({ client, transport } = await connectToServer(serverConfig));
    
    console.log(`📡 Calling ${serverName}/${toolName}...`);
    
    const result = await client.callTool({
      name: toolName,
      arguments: params,
    });
    
    // Output result
    if (result.content) {
      for (const item of result.content) {
        if (item.type === 'text') {
          console.log(item.text);
        } else if (item.type === 'image') {
          console.log(`[Image: ${item.mimeType}]`);
        } else if (item.type === 'resource') {
          console.log(`[Resource: ${item.resource?.uri}]`);
          if (item.resource?.text) console.log(item.resource.text);
        } else {
          console.log(JSON.stringify(item, null, 2));
        }
      }
    }
    
    if (result.isError) {
      console.error('⚠️ Tool returned an error');
      process.exit(1);
    }
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

async function addServer(name, command, args, options = {}) {
  const config = await loadConfig();
  
  config.servers[name] = {
    command,
    args: args || [],
    env: options.env || {},
    description: options.description || '',
  };
  
  await saveConfig(config);
  console.log(`✅ Server "${name}" added.`);
  console.log(`   Command: ${command} ${(args || []).join(' ')}`);
}

async function removeServer(name) {
  const config = await loadConfig();
  
  if (!config.servers[name]) {
    console.error(`❌ Server "${name}" not found.`);
    process.exit(1);
  }
  
  delete config.servers[name];
  await saveConfig(config);
  console.log(`✅ Server "${name}" removed.`);
}

// ─── List Resources ───

async function listResources(serverName) {
  const config = await loadConfig();
  const serverConfig = config.servers[serverName];
  
  if (!serverConfig) {
    console.error(`❌ Server "${serverName}" not found.`);
    process.exit(1);
  }

  let client;
  try {
    ({ client } = await connectToServer(serverConfig));
    
    const { resources } = await client.listResources();
    
    console.log(`\n📦 Resources from "${serverName}" (${resources.length}):\n`);
    for (const r of resources) {
      console.log(`  ${r.name || r.uri}`);
      if (r.description) console.log(`    ${r.description}`);
      console.log(`    URI: ${r.uri}`);
      console.log();
    }
  } catch (e) {
    if (e.message?.includes('not support')) {
      console.log('This server does not support resources.');
    } else {
      throw e;
    }
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

// ─── Batch: List All Tools from All Servers ───

async function listAllTools() {
  const config = await loadConfig();
  const servers = Object.entries(config.servers);
  
  if (servers.length === 0) {
    console.log('No MCP servers configured.');
    return;
  }

  const allTools = {};
  
  for (const [name, cfg] of servers) {
    try {
      const { client } = await connectToServer(cfg);
      const { tools } = await client.listTools();
      allTools[name] = tools.map(t => ({
        name: t.name,
        description: t.description,
        params: Object.keys(t.inputSchema?.properties || {}),
      }));
      await client.close().catch(() => {});
      console.log(`✅ ${name}: ${tools.length} tools`);
    } catch (e) {
      console.log(`❌ ${name}: ${e.message}`);
      allTools[name] = { error: e.message };
    }
  }

  console.log('\n--- All Tools ---');
  console.log(JSON.stringify(allTools, null, 2));
}

// ─── Main ───

const [,, cmd, ...rest] = process.argv;

switch (cmd) {
  case 'list-servers':
    await listServers();
    break;
    
  case 'list-tools':
    if (rest[0] === '--all') {
      await listAllTools();
    } else if (rest[0]) {
      await listTools(rest[0]);
    } else {
      console.error('Usage: node mcp-client.mjs list-tools <server-name|--all>');
      process.exit(1);
    }
    break;
    
  case 'call':
    if (rest.length < 2) {
      console.error('Usage: node mcp-client.mjs call <server-name> <tool-name> [json-params]');
      process.exit(1);
    }
    await callTool(rest[0], rest[1], rest[2]);
    break;
    
  case 'add-server': {
    if (rest.length < 2) {
      console.error('Usage: node mcp-client.mjs add-server <name> <command> [args...]');
      process.exit(1);
    }
    const [name, command, ...args] = rest;
    await addServer(name, command, args);
    break;
  }
    
  case 'remove-server':
    if (!rest[0]) {
      console.error('Usage: node mcp-client.mjs remove-server <name>');
      process.exit(1);
    }
    await removeServer(rest[0]);
    break;
    
  case 'list-resources':
    if (!rest[0]) {
      console.error('Usage: node mcp-client.mjs list-resources <server-name>');
      process.exit(1);
    }
    await listResources(rest[0]);
    break;
    
  default:
    console.log(`
🦊 PyraAI MCP Client v1.0

Commands:
  list-servers                          List configured MCP servers
  add-server <name> <cmd> [args...]     Add an MCP server
  remove-server <name>                  Remove an MCP server
  list-tools <server-name|--all>        List tools from a server
  list-resources <server-name>          List resources from a server
  call <server> <tool> [json-params]    Call a tool on a server

Examples:
  node mcp-client.mjs add-server filesystem npx @modelcontextprotocol/server-filesystem /tmp
  node mcp-client.mjs list-tools filesystem
  node mcp-client.mjs call filesystem read_file '{"path":"/tmp/test.txt"}'
`);
}
