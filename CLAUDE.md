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
- Calculates vote totals from actual reviewer data (not text parsing)
- Displays inline AI analysis within the content overlay
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

### API Interception Strategy
The extension uses `webRequest.filterResponseData` to intercept Nextdoor's ModerationFeed GraphQL API responses. This approach:
- Captures API responses before the page processes them
- Parses the `moderationSummaryV3` field from GraphQL responses
- Extracts structured moderation data (reports, votes, notes, conversation threads)
- Does NOT rely on DOM scraping (more reliable than CSS selectors)

### Vote Totals Calculation
**Important:** Vote totals are calculated by counting actual reviewer votes, NOT by parsing text patterns:

```javascript
// Count votes from individual_report entries
moderationDetails.reports.forEach((report) => {
  if (report.type === 'individual_report') {
    if (report.voteType === 'keep') keepCount++;
    else if (report.voteType === 'abstain') maybeRemoveCount++;
    else if (report.voteType === 'remove') removeCount++;
  }
});
```

This approach is more reliable than regex parsing and handles edge cases (1, 2, or 3 votes).

### Vote Type Labels
- **Keep** = `voteType === 'keep'` (green ✓)
- **Maybe remove** = `voteType === 'abstain'` (grey −) - NOT "Abstain"
- **Remove** = `voteType === 'remove'` (red ✗)
- **Report** = `voteType === 'report'` (orange 🚩) - for reporters who haven't voted yet

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

### Additional Context Feature
The content overlay includes an optional "Additional Context" textarea that allows moderators to provide context the LLM cannot see:

**Use cases:**
- Describe images: "Post includes photo of political yard sign"
- Describe videos: "Video shows heated argument at meeting"
- Describe links: "Link to partisan news article"
- Ask specific questions: "Does this count as harassment if the person is a local business owner?"

**How it works:**
1. User enters context in textarea before clicking "Analyze with AI"
2. Context is sent to background script as `additionalContext` parameter
3. Background includes it in prompt under "ADDITIONAL CONTEXT (provided by moderator)"
4. LLM uses context for analysis AND addresses moderator questions in separate "Moderator Questions/Comments" section
5. LLM response includes both the standard analysis and specific answers to moderator input

### LLM Prompt Structure
The prompt instructs the LLM to provide independent analysis focused on the flagged content only:

**Key prompt features:**
- Emphasizes independence from reporter tags and voting trends
- Specifically warns about "public shaming" tags being misapplied to political critiques
- Requires tag validity assessment: Valid / Doesn't Apply / Borderline
- Provides decision logic: all tags "Doesn't Apply" → Keep; majority "Valid" → Remove; mixed → Maybe Remove
- Focuses analysis on flagged content (not entire thread)
- Original post and conversation thread provided for context only

**LLM Output Format:**
1. **Tag Analysis** - Evaluates each report tag independently
2. **Vote Suggestion** - Keep / Remove / Maybe Remove
3. **Why** - Brief explanation matching the tag analysis
4. **Comment Suggestion** - Concise phrase (5-10 words) for moderator comment
5. **Moderator Questions/Comments** (if additional context provided) - Addresses moderator input
6. **Additional Context** - Voting trends, reviewer comments, tone assessment, mitigating factors

### Storage Schema
API configuration is stored in `browser.storage.local`:
- `apiKey`: User's LLM API key
- `apiEndpoint`: Full API URL
- `model`: Model identifier string

**Important:** Settings persist across Firefox sessions even for temporary add-ons.

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
