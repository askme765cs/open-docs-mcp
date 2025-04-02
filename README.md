# open-docs-mcp MCP Server

[![smithery badge](https://smithery.ai/badge/@askme765cs/open-docs-mcp)](https://smithery.ai/server/@askme765cs/open-docs-mcp)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9.5-blue.svg)](package.json)

An open-source MCP implementation providing document management functionality.
[中文文档][url-doczh]

## Features

### Document Management
- Crawl and index documentation from various sources
- Support for multiple document formats
- Full-text search capabilities

### MCP Server API
- Resource-based access to documents
- Tool-based document management

### Available Tools
1. **enable_doc** - Enable crawling for a specific doc
2. **disable_doc** - Disable crawling for a specific doc
3. **crawl_docs** - Start crawling enabled docs
4. **build_index** - Build search index for docs
5. **search_docs** - Search documentation
6. **list_enabled_docs** - List enabled docs
7. **list_all_docs** - List all available docs

### Cursor @Docs Compatibility

This project aims to replicate Cursor's @Docs functionality by providing:

1. **Document Indexing**:
   - Crawl and index documentation from various sources
   - Support for multiple document formats (HTML, Markdown, etc.)
   - Automatic re-indexing to keep docs up-to-date

2. **Document Access**:
   - Search across all indexed documentation
   - Integration with MCP protocol for AI context

3. **Custom Docs Management**:
   - Add new documentation sources via `enable_doc` tool
   - Manage enabled docs via `list_enabled_docs` tool
   - Force re-crawl with `crawl_docs` tool

### Architecture
```
┌───────────────────────────────────────────────────────┐
│                    open-docs-mcp Server                    │
├───────────────────┬───────────────────┬───────────────┤
│   Crawler Module  │  Search Engine    │  MCP Server   │
├───────────────────┼───────────────────┼───────────────┤
│ - Web crawling    │ - Full-text index │ - Resources   │
│ - Doc conversion  │ - Relevance score │ - Tools       │
│ - Storage         │ - Query parsing   │ - Prompts     │
└───────────────────┴───────────────────┴───────────────┘
```

## Usage

```bash
npx -y open-docs-mcp --docsDir ./docs
```

### Installing via Smithery

To install Document Management Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@askme765cs/open-docs-mcp):

```bash
npx -y @smithery/cli install @askme765cs/open-docs-mcp --client claude
```

### Configuration

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "open-docs-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "open-docs-mcp",
        "--docsDir",
        "/path/to/docs"
      ]
    }
  }
}
```

**Configuration Options:**
- `command`: Node.js executable
- `args`: Array of arguments to pass to the script
  - `--docsDir`: Required, specifies docs directory path
- `disabled`: Set to true to temporarily disable the server
- `alwaysAllow`: Array of tool names that can be used without confirmation

## Development

```bash
npm run watch  # Auto-rebuild on changes
npm run inspector  # Debug with MCP Inspector
```

## Documentation
Full documentation is available in the [docs](/docs) directory.

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License
[MIT](LICENSE)

[url-doczh]: README.zh-CN.md
