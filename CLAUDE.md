# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Firefox browser extension (Manifest V3) built with vanilla JavaScript and Vite. The extension integrates with external LLM APIs to provide AI-powered content analysis functionality for a specific web platform.

**Technology Stack:**
- **Platform:** Firefox WebExtension (Manifest V3)
- **Build Tool:** Vite 7.2+ with `vite-plugin-web-extension`
- **Language:** Vanilla JavaScript (ES6+ modules)
- **UI:** Plain HTML/CSS (no framework)
- **Package Manager:** npm

## Development Commands

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Production build
npm run build

# Preview built extension
npm run preview
```

## Loading Extension in Firefox

1. Run `npm run dev` or `npm run build`
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `dist/manifest.json`

The extension auto-reloads on file changes when using `npm run dev`.

## Architecture

### Three-Part Extension Structure

The extension follows the standard WebExtension architecture with three main components that communicate via `browser.runtime.sendMessage`:

1. **Content Script** (`src/content/content.js`)
   - Injected into target web pages
   - Scans page DOM for specific content
   - Creates UI overlays and buttons on the page
   - Listens for messages from background script
   - Sends extracted content to background for processing

2. **Background Service Worker** (`src/background/background.js`)
   - Persistent service worker (MV3)
   - Manages API configuration via `browser.storage.local`
   - Makes HTTP requests to external LLM APIs
   - Processes and parses API responses
   - Relays results back to content script

3. **Popup UI** (`src/popup/`)
   - Browser action popup (HTML/CSS/JS)
   - Configuration interface for API settings
   - Saves settings to browser local storage
   - No direct communication with content script

### Message Flow

```
User clicks button → Content Script extracts data →
Background Worker calls LLM API →
Background parses response → Content Script displays results
```

### Build System Details

**Vite Configuration** (`vite.config.js`):
- Uses `vite-plugin-web-extension` for Firefox-specific builds
- Multi-entry build: popup HTML, background JS, content JS
- Custom plugin copies PNG icons from `icons/` to `dist/icons/`
- Watches `src/**/*` and `icons/**/*` for changes
- Output: `dist/` directory with complete extension

**Icon Generation:**
Source SVG at `icons/icon.svg` must be converted to PNG (16, 32, 48, 128px) using:
```bash
rsvg-convert -w SIZE -h SIZE icons/icon.svg > icons/icon-SIZE.png
```

## Key Implementation Notes

### DOM Selector Configuration
The content script uses a `SELECTORS` object to locate page elements. These selectors are **placeholder patterns** and must be updated based on the actual target website's DOM structure:

```javascript
// src/content/content.js
const SELECTORS = {
  originalPost: '[data-testid="post-content"]',
  flaggedPost: '.highlighted-post',
  postContent: '.post-body',
  authorName: '[data-testid="author-name"]',
};
```

**To update:** Inspect target website, identify actual selectors, update this object.

### LLM API Integration
`src/background/background.js` contains the `analyzeWithLLM()` function that calls external LLM APIs. Current implementation uses OpenAI-style request format:

```javascript
{
  model: 'gpt-4',
  messages: [{ role: 'system', content: '...' }, ...],
  temperature: 0.3
}
```

**Important:** If using Anthropic Claude API, the request format must be adapted (different endpoint structure, different message format).

### Storage Schema
API configuration is stored in `browser.storage.local`:
- `apiKey`: User's LLM API key
- `apiEndpoint`: Full API URL
- `model`: Model identifier string

## Debugging

**Background script logs:**
- Open `about:debugging#/runtime/this-firefox`
- Click "Inspect" next to the extension
- Or use browser console (Ctrl+Shift+J / Cmd+Option+J)

**Content script logs:**
- Open target website
- Press F12 for DevTools
- Look for `[Nextdoor Moderator]` prefixed console messages

**Popup logs:**
- Right-click extension icon → Inspect

## Permissions

Defined in `manifest.json`:
- `storage` - Local API configuration storage
- `activeTab` - Access current tab content
- `scripting` - Inject content scripts
- `host_permissions` - Specific to target website domain

## Common Modifications

1. **Changing target website:** Update `host_permissions` in `manifest.json` and content script URL patterns
2. **Adding LLM provider:** Update popup UI options and background API call logic
3. **Customizing UI:** Edit overlay styles in `src/content/content.js` and `src/popup/popup.css`
4. **Updating analysis prompt:** Modify prompt template in `analyzeWithLLM()` function
