# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Fixed
- Auto-create config file when not exists to prevent errors on first run
- Fixed error when running `list_all_docs` or `list_enabled_docs` before any configuration
- Fixed incorrect path handling in document crawling that ignored the `--docsDir` parameter
- Added WSL compatibility options to Puppeteer for better performance in WSL environments

## [1.0.0] - 2025-03-25
### Added
- Initial release of docs-mcp MCP Server
- Core functionality for document management
- MCP protocol implementation
- Basic document summarization

### Changed
- Updated project documentation
- Improved README and project brief
- Version bump to 1.0.0

### Fixed
- Documentation formatting issues
- Project metadata consistency