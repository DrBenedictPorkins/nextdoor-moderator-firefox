# Quick Start Guide

## Get Started in 3 Steps

### Step 1: Build the Extension

```bash
npm install
npm run build
```

### Step 2: Load in Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to this project's `dist/` folder
4. Select the `manifest.json` file

### Step 3: Configure Your LLM API

1. Click the extension icon in your Firefox toolbar
2. Select your LLM provider:
   - **OpenAI**: Best for GPT-4 access
   - **Anthropic**: Best for Claude 3.5 Sonnet
   - **Custom**: For self-hosted or other providers
3. Enter your API key
4. Click **Save Configuration**

## Using the Extension

1. Navigate to a Nextdoor post page
2. Click the **Analyze Post** button (bottom-right of page)
3. Review the AI recommendation and reasoning
4. Make your moderation decision

## Development Mode

For development with hot-reload:

```bash
npm run dev
```

Then load the extension from `dist/` as described in Step 2.

## Troubleshooting

**No "Analyze Post" button visible?**
- Ensure you're on `nextdoor.com`
- Refresh the page
- Check the browser console for errors

**API errors?**
- Verify your API key is correct
- Check you have available credits
- Ensure the endpoint URL matches your provider

**Content not detected?**
- Nextdoor's DOM may have changed
- Update selectors in `src/content/content.js`

## Next Steps

- Customize Nextdoor guidelines in `src/background/background.js`
- Update DOM selectors if Nextdoor's structure changes
- Add additional LLM providers in the popup configuration

## API Provider Setup

### OpenAI
- Get API key: https://platform.openai.com/api-keys
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Model: `gpt-4` or `gpt-3.5-turbo`

### Anthropic
- Get API key: https://console.anthropic.com/
- Endpoint: `https://api.anthropic.com/v1/messages`
- Model: `claude-3-5-sonnet-20241022`

### Custom/Self-Hosted
- Any OpenAI-compatible endpoint
- Ollama, LM Studio, vLLM, etc.
