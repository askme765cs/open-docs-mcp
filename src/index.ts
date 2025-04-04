#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { SearchEngine } from './search.js';

/**
 * Type alias for a note object.
 */
type Note = { title: string, content: string };
type Doc = { name: string, crawlerStart: string, crawlerPrefix: string };
type DocConfig = { [name: string]: boolean };

/**
 * Simple in-memory storage for notes and docs.
 * In a real implementation, this would likely be backed by a database.
 */
const notes: { [id: string]: Note } = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" }
};

let docs: Doc[] = [];
let docConfig: DocConfig = {};

// Parse command line arguments
const argv = await yargs(hideBin(process.argv))
  .option('docsDir', {
    alias: 'd',
    type: 'string',
    description: 'Directory to store docs and config',
    default: './docs'
  })
  .parse();

const docDir = argv.docsDir || process.env.DOCS_DIR || './docs';
const configPath = path.join(docDir, 'docs-config.json');

/**
 * Create empty config file if it doesn't exist
 */
async function ensureConfigFile(): Promise<void> {
  try {
    if (!(await fs.pathExists(configPath))) {
      await fs.ensureDir(docDir);
      await fs.writeJson(configPath, {
        enabledDocs: {},
        crawledDocs: {}
      }, { spaces: 2 });
      console.log(`Created empty config file at ${configPath}`);
    }
  } catch (error) {
    console.error('Failed to create config file:', error);
  }
}

/**
 * Load doc config from file
 */
async function loadDocConfig(): Promise<void> {
  try {
    // Ensure config file exists before trying to load it
    await ensureConfigFile();
    
    const config = await fs.readJson(configPath);
    docConfig = config.enabledDocs || {};
  } catch (error) {
    console.error('Failed to load doc config:', error);
    docConfig = {};
  }
}

/**
 * Save doc config to file
 */
async function saveDocConfig(): Promise<void> {
  try {
    const config = {
      enabledDocs: docConfig,
      crawledDocs: {}
    };
    if (await fs.pathExists(configPath)) {
      const existingConfig = await fs.readJson(configPath);
      config.crawledDocs = existingConfig.crawledDocs || {};
    }
    await fs.ensureDir(docDir);
    await fs.writeJson(configPath, config, { spaces: 2 });
  } catch (error) {
    console.error('Failed to save doc config:', error);
  }
}

async function updateCrawledDoc(name: string): Promise<void> {
  try {
    // Ensure config file exists
    await ensureConfigFile();
    
    const config: { enabledDocs: DocConfig, crawledDocs: { [name: string]: string } } = {
      enabledDocs: docConfig,
      crawledDocs: {}
    };
    
    if (await fs.pathExists(configPath)) {
      const existingConfig = await fs.readJson(configPath);
      config.crawledDocs = existingConfig.crawledDocs || {};
    }
    
    config.crawledDocs[name] = new Date().toISOString();
    await fs.ensureDir(docDir);
    await fs.writeJson(configPath, config, { spaces: 2 });
  } catch (error) {
    console.error('Failed to update crawled doc:', error);
  }
}

/**
 * Load docs from remote JSONL file
 */
async function loadDocs(): Promise<void> {
  try {
    const response = await fetch('https://raw.githubusercontent.com/getcursor/crawler/main/docs.jsonl');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    docs = text
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (parseError) {
          console.error('Failed to parse line:', line, parseError);
          return null;
        }
      })
      .filter(doc => doc !== null) as Doc[];
  } catch (error) {
    console.error('Failed to load docs:', error);
    docs = []; // Fallback to empty array
  }
}

/**
 * Crawl and save docs locally
 */
async function crawlAndSaveDocs(force: boolean = false): Promise<void> {
  await fs.ensureDir(docDir);
  console.error('========== START CRAWLING ==========');
  for (const doc of docs) {
    if (!docConfig[doc.name]) {
      console.error(`Skipping doc ${doc.name} - not enabled`);
      continue;
    }

    // Skip if already crawled and not forcing re-crawl
    if (!force && await fs.pathExists(configPath)) {
      const config = await fs.readJson(configPath);
      if (config.crawledDocs && config.crawledDocs[doc.name]) {
        console.error(`Skipping doc ${doc.name} - already crawled at ${config.crawledDocs[doc.name]}`);
        continue;
      }
    }

    try {
      // Create doc directory - FIX: use the correct path from docDir parameter
      const docDirPath = path.join(docDir, doc.name);
      await fs.ensureDir(docDirPath);

      // Launch browser and open new page
      const browser = await puppeteer.launch({
        // WSL-friendly options to avoid GPU issues
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        headless: true
      });
      
      try {
        const page = await browser.newPage();
        
        // Navigate to start page
        console.error(`Processing doc: ${doc.name}`);
        console.error(`Crawler start: ${doc.crawlerStart}, Crawler prefix: ${doc.crawlerPrefix}`);
        await page.goto(doc.crawlerStart, { waitUntil: 'networkidle2' });

        // Extract all links
        const links = Array.from(new Set(
          await page.evaluate((prefix) => {
            const anchors = Array.from(document.querySelectorAll('a[href]'));
            return anchors
              .map(a => {
                const href = a.getAttribute('href');
                if (!href) return null;
                try {
                  const url = new URL(href, window.location.origin);
                  return url.toString();
                } catch (error) {
                  console.error(`Failed to parse href ${href}:`, error);
                  return null;
                }
              })
              .filter(link => link && link.startsWith(prefix));
          }, doc.crawlerPrefix)
        ));

        if (links.length > 0) {
          console.error(`Found ${links.length} valid links to process`);
          
          for (const link of links) {
            if (!link) continue;
            
            try {
              console.log(`Processing link: ${link}`);
              const newPage = await browser.newPage();
              await newPage.goto(link, { waitUntil: 'networkidle2' });
              // Extract content as Markdown
              const content = await newPage.evaluate(() => {
                // Get page title
                const title = document.title;
                
                // Find main content element
                const main = document.querySelector('main') ||
                           document.querySelector('article') ||
                           document.querySelector('.main-content') ||
                           document.body;

                // Convert content to Markdown
                let markdown = `# ${title}\n\n`;
                
                // Convert headings
                main.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
                  const level = parseInt(heading.tagName[1]);
                  const text = heading.textContent?.trim();
                  if (text) {
                    markdown += '#'.repeat(level) + ' ' + text + '\n\n';
                  }
                });

                // Convert paragraphs
                main.querySelectorAll('p').forEach(p => {
                  const text = p.textContent?.trim();
                  if (text) {
                    markdown += text + '\n\n';
                  }
                });

                // Convert code blocks
                main.querySelectorAll('pre').forEach(pre => {
                  const text = pre.textContent?.trim();
                  if (text) {
                    markdown += '```\n' + text + '\n```\n\n';
                  }
                });

                // Convert lists
                main.querySelectorAll('ul, ol').forEach(list => {
                  const isOrdered = list.tagName === 'OL';
                  list.querySelectorAll('li').forEach((li, index) => {
                    const text = li.textContent?.trim();
                    if (text) {
                      markdown += isOrdered ? `${index + 1}. ` : '- ';
                      markdown += text + '\n';
                    }
                  });
                  markdown += '\n';
                });

                return markdown.trim();
              });
              await newPage.close();
              
              // Save Markdown file
              // Create safe file name from URL path
              const url = new URL(link);
              const pathParts = url.pathname.split('/').filter(part => part.length > 0);
              let fileName = pathParts.join('_');
              
              // Add extension if not present
              if (!fileName.endsWith('.md')) {
                fileName += '.md';
              }
              // FIX: Use docDirPath instead of docDir
              const filePath = path.join(docDirPath, fileName);
              await fs.writeFile(filePath, content);
              console.log(`Successfully saved ${filePath}`);
              await updateCrawledDoc(doc.name);
            } catch (error) {
              console.error(`Failed to process page ${link}:`, error);
            }
          }
        } else {
          console.error('No valid links found');
        }
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error(`Failed to process doc ${doc.name}:`, error);
    }
  }
}

// Load docs and config when server starts
loadDocs();
loadDocConfig();

/**
 * Create an MCP server with capabilities for resources (to list/read notes),
 * tools (to create new notes), and prompts (to summarize notes).
 */

// 初始化搜索引擎
const searchEngine = new SearchEngine(docDir);
await searchEngine.initialize();

const server = new Server(
  {
    name: "docs-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    }
  }
);

/**
 * Handler for listing available resources (both notes and docs).
 * Each resource is exposed with:
 * - A unique URI scheme
 * - Plain text MIME type
 * - Human readable name and description
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const noteResources = Object.entries(notes).map(([id, note]) => ({
    uri: `note:///${id}`,
    mimeType: "text/plain",
    name: note.title,
    description: `A text note: ${note.title}`
  }));

  const docResources = docs.map((doc, index) => ({
    uri: `doc:///${index}`,
    mimeType: "text/plain",
    name: doc.name,
    description: `Documentation for ${doc.name}`
  }));

  return {
    resources: [...noteResources, ...docResources]
  };
});

/**
 * Handler for reading the contents of a specific note.
 * Takes a note:// URI and returns the note content as plain text.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const id = url.pathname.replace(/^\//, '');
  const note = notes[id];

  if (!note) {
    throw new Error(`Note ${id} not found`);
  }

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "text/plain",
      text: note.content
    }]
  };
});

/**
 * Handler that lists available tools.
 * Exposes tools for creating notes and managing docs.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "enable_doc",
        description: "Enable crawling for a specific doc",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the doc to enable"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "disable_doc",
        description: "Disable crawling for a specific doc",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the doc to disable"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "crawl_docs",
        description: "Start crawling enabled docs",
        inputSchema: {
          type: "object",
          properties: {
            force: {
              type: "boolean",
              description: "Whether to force re-crawl all docs, ignoring previous crawl records"
            }
          }
        }
      },
      {
        name: "build_index",
        description: "Build search index for docs",
        inputSchema: {
          type: "object",
          properties: {
            force: {
              type: "boolean",
              description: "Whether to force rebuild index"
            }
          }
        }
      },
      {
        name: "search_docs",
        description: "Search documentation",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query"
            },
            max_results: {
              type: "number",
              description: "Maximum number of results",
              default: 3
            },
            doc_name: {
              type: "string",
              description: "Filter by document category"
            },
            offset: {
              type: "number",
              description: "Number of results to skip",
              default: 0
            }
          },
          required: ["query"]
        }
      },
      {
        name: "build_index",
        description: "Build search index for docs",
        inputSchema: {
          type: "object",
          properties: {
            force: {
              type: "boolean",
              description: "Whether to force rebuild index"
            }
          }
        }
      },
      {
        name: "list_enabled_docs",
        description: "List all enabled docs with their cache status",
        inputSchema: {
          type: "object",
          properties: {
            verbose: {
              type: "boolean",
              description: "Whether to show detailed information",
              default: false
            }
          }
        }
      },
      {
        name: "list_all_docs",
        description: "List all available docs including disabled ones",
        inputSchema: {
          type: "object",
          properties: {
            verbose: {
              type: "boolean",
              description: "Whether to show detailed information",
              default: false
            }
          }
        }
      }
    ]
  };
});

/**
 * Handler for tool requests.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "enable_doc": {
      const name = String(request.params.arguments?.name);
      docConfig[name] = true;
      await saveDocConfig();
      return {
        content: [{
          type: "text",
          text: `Enabled doc ${name}`
        }]
      };
    }

    case "disable_doc": {
      const name = String(request.params.arguments?.name);
      docConfig[name] = false;
      await saveDocConfig();
      return {
        content: [{
          type: "text",
          text: `Disabled doc ${name}`
        }]
      };
    }

    case "crawl_docs": {
      const force = Boolean(request.params.arguments?.force);
      await crawlAndSaveDocs(force);
      return {
        content: [{
          type: "text",
          text: "Crawling completed"
        }]
      };
    }

    case "build_index": {
      const force = Boolean(request.params.arguments?.force);
      await searchEngine.buildIndex(docDir);
      return {
        content: [{
          type: "text",
          text: `Index built with ${Object.keys(searchEngine['docStore']).length} documents`
        }]
      };
    }

    case "list_enabled_docs": {
      // Ensure config file exists before reading it
      await ensureConfigFile();
      
      const verbose = Boolean(request.params.arguments?.verbose);
      const config = await fs.readJson(configPath);
      const enabledDocs = docs.filter(doc => docConfig[doc.name]);
      
      const result = enabledDocs.map(doc => {
        const crawledAt = config.crawledDocs?.[doc.name] || "Not crawled";
        return verbose
          ? `${doc.name} (Enabled)\n  Start URL: ${doc.crawlerStart}\n  Last crawled: ${crawledAt}`
          : `${doc.name} [${crawledAt === "Not crawled" ? "Not cached" : "Cached"}]`;
      });

      return {
        content: [{
          type: "text",
          text: result.join("\n") || "No enabled docs found"
        }]
      };
    }

    case "list_all_docs": {
      // Ensure config file exists before reading it
      await ensureConfigFile();
      
      const verbose = Boolean(request.params.arguments?.verbose);
      const config = await fs.readJson(configPath);
      
      const result = docs.map(doc => {
        const isEnabled = docConfig[doc.name];
        const crawledAt = isEnabled ? (config.crawledDocs?.[doc.name] || "Not crawled") : "";
        return verbose
          ? `${doc.name} (${isEnabled ? "Enabled" : "Disabled"})\n  Start URL: ${doc.crawlerStart}\n  Last crawled: ${crawledAt || "N/A"}`
          : `${doc.name} [${isEnabled ? (crawledAt === "Not crawled" ? "Enabled, not cached" : "Enabled, cached") : "Disabled"}]`;
      });

      return {
        content: [{
          type: "text",
          text: result.join("\n") || "No docs found"
        }]
      };
    }

    case "search_docs": {
      const query = String(request.params.arguments?.query);
      const maxResults = Number(request.params.arguments?.max_results) || 3;
      const docName = request.params.arguments?.doc_name ?
        String(request.params.arguments.doc_name) : undefined;
      const offset = Number(request.params.arguments?.offset) || 0;
      const results = await searchEngine.search(query, maxResults, docName, 0.2, offset);
      return {
        content: results.map(result => ({
          type: "text",
          text: `[${result.score.toFixed(2)}] ${result.title}\n${result.excerpt}\n---`
        }))
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Handler that lists available prompts.
 * Exposes a single "summarize_notes" prompt that summarizes all notes.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "summarize_notes",
        description: "Summarize all notes",
      }
    ]
  };
});

/**
 * Handler for the summarize_notes prompt.
 * Returns a prompt that requests summarization of all notes, with the notes' contents embedded as resources.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "summarize_notes") {
    throw new Error("Unknown prompt");
  }

  const embeddedNotes = Object.entries(notes).map(([id, note]) => ({
    type: "resource" as const,
    resource: {
      uri: `note:///${id}`,
      mimeType: "text/plain",
      text: note.content
    }
  }));

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Please summarize the following notes:"
        }
      },
      ...embeddedNotes.map(note => ({
        role: "user" as const,
        content: note
      })),
      {
        role: "user",
        content: {
          type: "text",
          text: "Provide a concise summary of all the notes above."
        }
      }
    ]
  };
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
