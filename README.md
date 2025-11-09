# Nextdoor Moderator Extension

AI-powered moderation assistant for Nextdoor community moderators. This Firefox extension helps moderators make informed decisions by analyzing flagged content against Nextdoor's community guidelines using Large Language Models.

## Features

- **Content Scanning**: Automatically identifies original posts and flagged content on Nextdoor pages
- **AI-Powered Analysis**: Uses cloud LLM APIs (OpenAI, Anthropic, or custom) to evaluate content
- **Guideline Compliance**: Compares posts against Nextdoor's community guidelines
- **Smart Recommendations**: Provides Approve/Remove/Review recommendations with confidence levels
- **Privacy-First**: All API keys stored locally, never transmitted except to your configured LLM endpoint

## Installation

### Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load in Firefox:
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file from the `dist/` directory

### Development Mode (with hot reload)

```bash
npm run dev
```

Then load the extension from the `dist/` directory as described above. The extension will auto-reload when you make changes.

## Configuration

1. Click the extension icon in your Firefox toolbar
2. Select your LLM provider (OpenAI, Anthropic, or custom)
3. Enter your API key
4. Choose your model (e.g., `gpt-4`, `claude-3-5-sonnet-20241022`)
5. Click "Save Configuration"

### Supported LLM Providers

- **OpenAI**: GPT-4, GPT-3.5-turbo, etc.
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus, etc.
- **Custom**: Any OpenAI-compatible API endpoint

## Usage

1. Navigate to a Nextdoor post that needs moderation
2. Click the "Analyze Post" button that appears in the bottom-right corner
3. Wait for the AI analysis to complete
4. Review the recommendation, confidence level, and reasoning
5. Make your moderation decision based on the AI guidance

## How It Works

1. **Content Script** (`src/content/content.js`):
   - Scans the current Nextdoor page for posts
   - Extracts original post content and flagged content
   - Displays analysis results in an overlay UI

2. **Background Service Worker** (`src/background/background.js`):
   - Manages API configuration and storage
   - Communicates with configured LLM API
   - Processes and parses AI responses

3. **Popup UI** (`src/popup/`):
   - Configuration interface for API settings
   - Status indicator showing configuration state
   - Usage instructions

## File Structure

```
nextdoor-moderator-extension/
├── manifest.json           # Extension manifest (Manifest V3)
├── vite.config.js          # Vite build configuration
├── package.json            # npm dependencies and scripts
├── icons/                  # Extension icons
│   └── icon.svg
├── src/
│   ├── content/
│   │   └── content.js      # Content script for page interaction
│   ├── background/
│   │   └── background.js   # Background service worker
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

### Customizing DOM Selectors

Nextdoor's DOM structure may change. Update the selectors in `src/content/content.js`:

```javascript
const SELECTORS = {
  originalPost: '[data-testid="post-content"]',
  flaggedPost: '.highlighted-post, .moderation-highlight',
  postContent: '.post-body, .post-text',
  authorName: '[data-testid="author-name"]',
};
```

### Customizing Guidelines

Edit the `NEXTDOOR_GUIDELINES` constant in `src/background/background.js` to match your community's specific guidelines.

## Security & Privacy

- API keys are stored in Firefox's local storage
- No data is transmitted to third parties except your configured LLM API
- All analysis happens in real-time; no data is cached or stored
- The extension only runs on `*.nextdoor.com` domains

## Permissions

This extension requires the following permissions:

- `storage`: Store API configuration locally
- `activeTab`: Access the current Nextdoor tab for content scanning
- `scripting`: Inject content scripts into Nextdoor pages
- `host_permissions` for `*.nextdoor.com`: Required to analyze Nextdoor content

## Troubleshooting

### Extension not working on Nextdoor pages

1. Check that you're on a `nextdoor.com` domain
2. Refresh the page after loading the extension
3. Check the browser console for errors

### API errors

1. Verify your API key is correct
2. Check that your LLM endpoint URL is correct
3. Ensure you have API credits/quota remaining
4. Check browser console for detailed error messages

### Content not being detected

Nextdoor's DOM structure may have changed. Inspect the page and update selectors in `src/content/content.js`.

## License

ISC

## Contributing

This is a personal moderation tool. Contributions are welcome to improve functionality, add new LLM providers, or enhance the UI.

## Disclaimer

This extension is not affiliated with or endorsed by Nextdoor. It is a personal tool to assist community moderators. All moderation decisions should be made by human moderators; this tool only provides AI-powered guidance.
