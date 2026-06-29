# Nextdoor Moderator Extension

AI-powered moderation assistant for Nextdoor community moderators. This Firefox extension intercepts moderation API responses, extracts detailed voting and reporting data, and uses Large Language Models to provide independent content analysis and vote recommendations.

## Features

- **API Interception**: Captures ModerationFeed GraphQL responses for detailed metadata extraction
- **Vote Totals Display**: Calculates and displays Keep/Maybe Remove/Remove vote counts from actual reviewer data
- **Individual Reviewer Details**: Shows each reviewer's vote with color-coded icons and comments
- **AI-Powered Analysis**: Independent tag validity assessment (Valid/Doesn't Apply/Borderline)
- **Additional Context Input**: Optional textarea to describe images, videos, or links for better LLM analysis
- **Comment Suggestions**: Generates a 1-sentence explanation written to other moderators (not the poster)
- **Inline Analysis**: Displays AI recommendations directly in the content overlay (no separate popup)
- **Privacy-First**: All API keys stored locally in `browser.storage.local`, persist across Firefox sessions

## Installation

### Quick Start (Temporary Add-on)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Firefox:**
   - Open Firefox
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click **"Load Temporary Add-on"**
   - Navigate to the project's `dist/` directory
   - Select **`manifest.json`**
   - Extension loads immediately

4. **Configure API settings:**
   - Click the extension icon in the toolbar
   - Enter your API key, endpoint, and model
   - Click "Save Configuration"

**Important Notes:**
- Temporary add-ons are removed when Firefox closes
- You must reload the extension each time you start Firefox (takes ~10 seconds)
- **Your API credentials persist** across sessions (stored in `browser.storage.local`)
- No signing required for temporary add-ons

### Permanent Installation (Optional)

For permanent installation without reloading on each Firefox start:

**Option 1: Firefox Developer Edition**
1. Download [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/)
2. Open `about:config` → Set `xpinstall.signatures.required` to `false`
3. Build extension: `npm run build`
4. Install permanently from `dist/manifest.json`

**Option 2: Self-signed XPI**

The extension includes a Firefox extension ID (`nextdoor-moderator@byteclub.com`) in `manifest.json`, which enables self-signed permanent installation without Developer Edition:

1. Submit to Mozilla Add-ons for signing (can be unlisted/private)
2. Receive signed `.xpi` file
3. Install in regular Firefox

### Development Mode (with auto-rebuild)

```bash
npm run dev
```

This watches for file changes and rebuilds automatically. Still need to click "Reload" in `about:debugging` after changes.

## Configuration

1. Click the extension icon in your Firefox toolbar
2. Select your LLM provider (OpenAI, Anthropic, or custom)
3. Enter your API key
4. Choose your model (e.g., `gpt-4`, `claude-3-5-sonnet-20241022`)
5. Click "Save Configuration"

### Supported LLM Providers

- **OpenAI**: GPT-4, GPT-3.5-turbo, etc.
- **Anthropic**: claude-sonnet-4-6, claude-opus-4-8, etc.
- **Custom**: Any OpenAI-compatible API endpoint

## Usage

1. **Navigate to Nextdoor moderation feed:**
   - Go to `https://nextdoor.com/moderation_feed`
   - Click on any flagged post to view details

2. **Click "Analyze Post" button:**
   - Button appears in top-right corner (below Nextdoor's navigation icons)
   - Button is disabled until moderation data loads
   - Green button = ready to analyze

3. **Review moderation data:**
   - Overlay shows original post, flagged content, and conversation thread
   - Vote totals displayed with color-coded icons (Keep/Maybe Remove/Remove)
   - Individual reviewer votes and comments shown

4. **Add additional context (optional):**
   - Use textarea to describe images, videos, or links
   - Example: "Post includes photo of political yard sign"
   - Ask specific questions: "Does this count as harassment if they're a business owner?"

5. **Click "Analyze with AI":**
   - LLM analyzes content independently
   - Analysis appears inline below the button
   - Includes: Tag Analysis, Vote Suggestion, Reasoning, Comment Suggestion, Moderator Q&A

6. **Make your decision:**
   - Review AI recommendation and reasoning
   - Use suggested comment text if helpful
   - Cast your vote on Nextdoor based on analysis

## How It Works

1. **Background Script** (`src/background/background.js`):
   - Intercepts ModerationFeed GraphQL API calls via `webRequest.filterResponseData`
   - Parses `moderationSummaryV3` data structure from API responses
   - Extracts reports, votes, notes, and conversation threads
   - Sends extracted data to content script
   - Manages LLM API communication (OpenAI/Anthropic/custom)
   - Optionally logs LLM requests/responses to markdown files

2. **Content Script** (`src/content/content-api.js`):
   - Receives moderation data from background script
   - Displays "Analyze Post" button (top-right, `top: 80px; right: 20px`)
   - Creates content overlay showing moderation metadata
   - Calculates vote totals from actual reviewer data (not text parsing)
   - Displays individual reviewer votes with color-coded icons
   - Handles additional context input from moderator
   - Displays inline AI analysis within overlay

3. **Popup UI** (`src/popup/`):
   - Configuration interface for API settings (key, endpoint, model)
   - Saves settings to `browser.storage.local` (persists across sessions)
   - Status indicator showing configuration state

## File Structure

```
nextdoor-moderator-extension/
├── manifest.json           # Extension manifest (Manifest V2)
├── vite.config.js          # Vite build configuration
├── package.json            # npm dependencies and scripts
├── CLAUDE.md               # Project documentation for Claude Code
├── .gitignore              # Git ignore rules
├── icons/                  # Extension icons (SVG + PNGs)
│   ├── icon.svg
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── src/
│   ├── content/
│   │   └── content-api.js  # Content script (API interception + UI)
│   ├── background/
│   │   └── background.js   # Background script (GraphQL interception + LLM)
│   └── popup/
│       ├── popup.html      # Popup UI HTML
│       ├── popup.css       # Popup UI styles
│       └── popup.js        # Popup UI logic
└── dist/                   # Built extension (after npm run build)
```

## Development

### Building for Production

```bash
npm run build
```

The built extension will be in the `dist/` directory.

### Customizing Nextdoor Guidelines

Edit the `NEXTDOOR_GUIDELINES` constant in `src/background/background.js` to match your community's specific guidelines or updates.

### Enabling LLM Logging

Set `ENABLE_LLM_LOGGING = true` in `src/background/background.js` to save LLM requests/responses to markdown files in your Downloads folder. Useful for debugging prompts.

## Security & Privacy

- API keys are stored in Firefox's local storage
- No data is transmitted to third parties except your configured LLM API
- All analysis happens in real-time; no data is cached or stored
- The extension only runs on `*.nextdoor.com` domains

## Permissions

This extension requires the following permissions (Manifest V2):

- `storage`: Store API configuration locally in `browser.storage.local`
- `activeTab`: Access the current Nextdoor tab
- `*://*.nextdoor.com/*`: Access to Nextdoor domain for content script injection
- `webRequest`: Intercept network requests (GraphQL API responses)
- `webRequestBlocking`: Modify and parse intercepted requests
- `downloads`: Save LLM conversation logs to Downloads folder (when logging enabled)

## Troubleshooting

### "Analyze Post" button not appearing

1. Check that you're on `nextdoor.com/moderation_feed`
2. Click on a flagged post to load moderation details
3. Check browser console (F12) for `[Content]` or `[Background]` error messages
4. Reload the extension via `about:debugging`

### Button stays disabled (grey)

1. Wait for the API response to be intercepted (may take 1-2 seconds)
2. Check browser console for `[Background] Intercepted ModerationFeed` message
3. Verify the GraphQL response contains `moderationSummaryV3` field
4. Try clicking on a different flagged post

### API errors

1. Verify your API key is correct in the popup settings
2. Check that your LLM endpoint URL is correct
3. Ensure you have API credits/quota remaining
4. Check browser console for detailed error messages
5. Enable LLM logging to see request/response details

### Analysis not displaying

1. Check browser console for `[Content] Received analysisResult` message
2. Verify the overlay is open (click "Analyze Post" first)
3. Check that the LLM response format matches expected structure
4. Look for errors in the background script inspector (`about:debugging`)

## License

ISC

## Contributing

This is a personal moderation tool. Contributions are welcome to improve functionality, add new LLM providers, or enhance the UI.

## Disclaimer

This extension is not affiliated with or endorsed by Nextdoor. It is a personal tool to assist community moderators. All moderation decisions should be made by human moderators; this tool only provides AI-powered guidance.
