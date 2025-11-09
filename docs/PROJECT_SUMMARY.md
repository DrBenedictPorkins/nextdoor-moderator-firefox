# Nextdoor Moderator Extension - Project Summary

## Overview

This Firefox extension assists Nextdoor community moderators by using AI (LLM) to analyze flagged content against community guidelines and provide moderation recommendations.

## Technology Stack

- **Build Tool**: Vite 7.2.2 with `vite-plugin-web-extension`
- **Framework**: Vanilla JavaScript (no UI frameworks)
- **Browser**: Firefox (Manifest V3)
- **LLM Integration**: Supports OpenAI, Anthropic Claude, and custom endpoints
- **Package Manager**: npm

## Project Structure

```
nextdoor-moderator-extension/
├── manifest.json              # Extension manifest (MV3)
├── vite.config.js             # Vite build configuration with icon copying
├── web-ext-config.js          # Web-ext CLI configuration
├── package.json               # Dependencies and build scripts
├── README.md                  # Full documentation
├── QUICK_START.md             # Quick setup guide
├── .env.example               # Example API configuration
├── .gitignore                 # Git ignore rules
│
├── icons/                     # Extension icons
│   ├── icon.svg              # Source SVG (128x128)
│   └── icon-{16,32,48,128}.png
│
├── src/
│   ├── content/
│   │   └── content.js        # Content script (page scanning & UI)
│   │
│   ├── background/
│   │   └── background.js     # Service worker (API calls & storage)
│   │
│   └── popup/
│       ├── popup.html        # Extension popup UI
│       ├── popup.css         # Popup styles
│       └── popup.js          # Popup logic (config management)
│
└── dist/                      # Built extension (after npm run build)
```

## Key Features

### 1. Content Scanning (`src/content/content.js`)
- Scans Nextdoor pages for original posts and flagged content
- Extracts post text, author, and metadata
- Displays "Analyze Post" button on Nextdoor pages
- Shows analysis results in an overlay UI
- Uses customizable DOM selectors for flexibility

### 2. AI Analysis (`src/background/background.js`)
- Communicates with LLM APIs (OpenAI, Anthropic, custom)
- Includes Nextdoor community guidelines in prompts
- Parses LLM responses into structured recommendations
- Provides: Recommendation (Approve/Remove/Review), Confidence, Reasoning
- Stores API configuration securely in browser local storage

### 3. Configuration UI (`src/popup/`)
- Clean, user-friendly popup interface
- API endpoint selection (OpenAI, Anthropic, custom)
- Secure API key storage (local only, never transmitted)
- Status indicator showing configuration state
- Model selection with defaults

## Build System

### Vite Configuration
- Multi-input build for popup, background, and content scripts
- Custom plugin to copy icons to dist/
- File watching for development mode
- Optimized production builds with code splitting

### Build Commands
```bash
npm run dev      # Development with hot reload
npm run build    # Production build
npm run preview  # Preview built extension
```

## Permissions & Security

### Required Permissions
- `storage`: Store API configuration locally
- `activeTab`: Access current Nextdoor tab
- `scripting`: Inject content scripts
- Host permissions: `*://*.nextdoor.com/*`

### Security Considerations
- API keys stored in Firefox's encrypted local storage
- No data transmitted except to configured LLM endpoint
- No external analytics or tracking
- Content-Security-Policy compliant
- Runs only on Nextdoor domains

## Customization Points

### 1. DOM Selectors (`src/content/content.js`)
Update these if Nextdoor's HTML structure changes:
```javascript
const SELECTORS = {
  originalPost: '[data-testid="post-content"]',
  flaggedPost: '.highlighted-post, .moderation-highlight',
  postContent: '.post-body, .post-text',
  authorName: '[data-testid="author-name"]',
};
```

### 2. Community Guidelines (`src/background/background.js`)
Customize the `NEXTDOOR_GUIDELINES` constant to match your community's specific rules.

### 3. LLM Prompt Engineering
Modify the prompt in `analyzeWithLLM()` to adjust analysis criteria.

### 4. UI Styling (`src/popup/popup.css`, content.js overlay styles)
Adjust colors, layout, and branding as needed.

## Development Workflow

1. **Initial Setup**
   ```bash
   npm install
   npm run build
   ```

2. **Load in Firefox**
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `dist/manifest.json`

3. **Development Mode**
   ```bash
   npm run dev
   ```
   - Auto-reloads on file changes
   - Browser console shows logs

4. **Testing**
   - Navigate to Nextdoor.com
   - Click "Analyze Post" button
   - Check browser console for debugging

## LLM Provider Integration

### Current Support
- **OpenAI**: GPT-4, GPT-3.5-turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus
- **Custom**: Any OpenAI-compatible API

### API Request Format
The extension expects OpenAI-style chat completions:
```json
{
  "model": "gpt-4",
  "messages": [...],
  "temperature": 0.3
}
```

For Anthropic, you'll need to adapt the request format in `analyzeWithLLM()`.

## Known Limitations

1. **DOM Dependency**: Relies on Nextdoor's HTML structure (may break with updates)
2. **Temporary Extension**: Firefox temporary add-ons expire on browser restart
3. **Manual Configuration**: Users must obtain and configure their own API keys
4. **No Offline Mode**: Requires internet connection for LLM API calls
5. **API Costs**: Users responsible for LLM API usage costs

## Future Enhancement Ideas

- [ ] Add local LLM support (Ollama, LM Studio)
- [ ] Implement caching for repeated content
- [ ] Add batch analysis for multiple posts
- [ ] Create Firefox Add-ons store listing (requires signing)
- [ ] Add analytics dashboard for moderation decisions
- [ ] Support for Chrome/Edge (minor manifest changes)
- [ ] Implement rate limiting and cost tracking
- [ ] Add custom rule configuration UI
- [ ] Export moderation reports

## Deployment

### For Personal Use
1. Build: `npm run build`
2. Load as temporary add-on
3. Configure API settings
4. Use on Nextdoor.com

### For Distribution (Firefox Add-ons)
1. Package: `web-ext build`
2. Sign at https://addons.mozilla.org/developers/
3. Distribute signed `.xpi` file

## Troubleshooting

See `README.md` and `QUICK_START.md` for detailed troubleshooting steps.

Common issues:
- Content not detected → Update DOM selectors
- API errors → Verify API key and endpoint
- Extension not loading → Check manifest.json syntax
- Build errors → Clear `dist/` and `node_modules/`, reinstall

## License

ISC - Free for personal and commercial use

## Support & Contribution

This is a personal project. Issues and pull requests welcome for:
- Bug fixes
- New LLM provider support
- UI/UX improvements
- Documentation updates
