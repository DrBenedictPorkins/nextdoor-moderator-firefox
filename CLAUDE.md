# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Firefox browser extension (Manifest V2) for Nextdoor community moderators. It intercepts ModerationFeed GraphQL API responses, extracts moderation metadata, and sends flagged content to an LLM for independent analysis and vote recommendations.

**Technology Stack:**
- **Platform:** Firefox WebExtension (Manifest V2)
- **Build Tool:** Vite 7.2+ with `vite-plugin-web-extension`
- **Language:** Vanilla JavaScript (ES6+ modules)
- **UI:** Plain HTML/CSS (no framework)
- **Package Manager:** npm

**Key Features:**
- Intercepts Nextdoor's ModerationFeed GraphQL API using `webRequest.filterResponseData`
- Smart conversation thread truncation using @mention tags to reduce LLM context
- Searches all comments (including siblings) for mentioned users
- Displays inline AI analysis with color-coded vote suggestions
- Supports optional moderator context input for images/videos/links
- Independent tag validity assessment (Valid/Doesn't Apply/Borderline)

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

**As Temporary Add-on (Development):**
1. Run `npm run dev` or `npm run build`
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `dist/manifest.json`

**Important Notes:**
- Temporary add-ons are removed when Firefox closes
- Must reload extension each Firefox session via `about:debugging`
- API credentials persist across sessions (stored in `browser.storage.local`)
- For permanent installation, use Firefox Developer Edition with `xpinstall.signatures.required` set to `false`

## Architecture

### Three-Part Extension Structure

The extension follows the standard WebExtension architecture with three main components:

1. **Content Script** (`src/content/content-api.js`)
   - Injected into Nextdoor moderation pages
   - Displays "Analyze Post" button (positioned at `top: 80px; right: 20px` to avoid UI conflicts)
   - Creates content review overlay with moderation metadata
   - Includes optional "Additional Context" textarea for moderator input (images/videos/links)
   - Displays inline AI analysis within the same overlay
   - Sends extracted content + additional context to background for processing

2. **Background Script** (`src/background/background.js`)
   - Intercepts ModerationFeed GraphQL API calls via `webRequest.filterResponseData`
   - Parses `moderationSummaryV3` data structure from API responses
   - Manages API configuration via `browser.storage.local`
   - Makes HTTP requests to external LLM APIs (OpenAI/Anthropic/custom)
   - Processes and parses API responses
   - Optionally logs LLM request/response to markdown files (when `ENABLE_LLM_LOGGING = true`)
   - Relays results back to content script

3. **Popup UI** (`src/popup/`)
   - Browser action popup (HTML/CSS/JS)
   - Configuration interface for API settings (key, endpoint, model)
   - Saves settings to browser local storage
   - No direct communication with content script

### Message Flow

```
1. User navigates to moderation page
2. Background intercepts ModerationFeed GraphQL API response
3. Background parses moderationSummaryV3 data and sends to content script
4. Content script enables "Analyze Post" button
5. User clicks "Analyze Post" → overlay displays with moderation metadata
6. User optionally adds context (images/videos/links description)
7. User clicks "Analyze with AI" → content script sends data + context to background
8. Background calls LLM API with structured prompt
9. Background parses LLM response → sends back to content script
10. Content script displays formatted analysis inline in overlay
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

### Smart Conversation Thread Truncation
The extension uses `comment.tags` array to detect @mentions and includes only relevant comments:
- When a flagged comment mentions another user, their comment is included (even if it's a sibling)
- Searches all processed comments, not just the direct parent chain
- Reduces LLM context usage by 60-80% compared to full thread inclusion
- Fallback: If no mentions detected, includes only the direct parent comment

### Vote Type Labels
- **Keep** = `voteType === 'keep'` (green ✓)
- **Maybe remove** = `voteType === 'abstain'` (grey −) - NOT "Abstain"
- **Remove** = `voteType === 'remove'` (red ✗)
- **Report** = `voteType === 'report'` (orange 🚩)

### LLM Response Display
Vote suggestions are color-coded in the analysis overlay:
- **Keep**: Green (#2e7d32) with ✓
- **Remove**: Red (#c62828) with ✗
- **Maybe Remove**: Gray (#757575) with −

### Storage Schema
API configuration stored in `browser.storage.local`:
- `apiKey`: User's LLM API key
- `apiEndpoint`: Full API URL
- `model`: Model identifier string

Settings persist across Firefox sessions even for temporary add-ons.

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

Defined in `manifest.json` (Manifest V2):
- `storage` - Local API configuration storage
- `activeTab` - Access current tab content
- `*://*.nextdoor.com/*` - Access to Nextdoor domain
- `webRequest` - Intercept network requests
- `webRequestBlocking` - Block and modify requests
- `downloads` - Save LLM logs to Downloads folder (when logging enabled)

## Common Modifications

1. **Updating Nextdoor guidelines:** Edit `NEXTDOOR_GUIDELINES` constant in `src/background/background.js`
2. **Changing LLM provider:** Update API endpoint and request format in `analyzeWithLLM()` function
3. **Adjusting button position:** Modify `top` and `right` values in button creation (currently `top: 80px; right: 20px`)
4. **Updating analysis prompt:** Edit prompt template in `analyzeWithLLM()` function
5. **Enabling/disabling LLM logging:** Set `ENABLE_LLM_LOGGING` flag in `src/background/background.js`
6. **Customizing vote labels:** Update vote type mappings in content script (Keep/Maybe remove/Remove/Report)
