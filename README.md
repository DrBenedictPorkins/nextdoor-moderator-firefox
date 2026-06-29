# Nextdoor Moderator Assistant

A Firefox extension that helps Nextdoor community moderators make faster, more consistent decisions using AI analysis.

The extension intercepts Nextdoor's moderation API in real time, extracts post and voting data, and sends it to an LLM for independent analysis — without leaving the page.

---

## Features

- **AI Review** — One-click analysis of any flagged post against Nextdoor's official moderation guidelines, with a clear Keep / Maybe Remove / Remove recommendation and reasoning
- **Post Panel** — Expandable side panel on any open post: full thread preview, AI chat, and comment drafting
- **AI Chat** — Ask follow-up questions about a post in context; the full thread is always in scope
- **Poll Support** — Correctly handles survey/poll posts in addition to standard text posts
- **Widget** — Floating toolbar with quick access to AI Review, Post Panel, and Mod History
- **Per-Provider API Keys** — OpenAI and Anthropic keys stored separately; switching providers restores the correct key automatically
- **Model Attribution** — Every AI recommendation shows which model and provider generated it
- **Privacy-First** — API keys stored locally in `browser.storage.local`, never transmitted to third parties

---

## Screenshots

*(Coming soon — see `assets/screenshots/`)*

---

## Installation

### From Mozilla Add-ons (AMO)

*(Coming soon)*

### Manual / Development

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/DrBenedictPorkins/nextdoor-moderator-firefox.git
   cd nextdoor-moderator-firefox
   npm install
   ```

2. Build:
   ```bash
   npm run build
   ```

3. Load in Firefox:
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click **Load Temporary Add-on**
   - Select `dist/manifest.json`

4. Configure:
   - Click the extension icon in the toolbar
   - Select your LLM provider (OpenAI or Anthropic)
   - Paste your API key and choose a model
   - Click **Save Configuration** — the key is validated before saving

> Temporary add-ons are removed when Firefox closes. Reload from `about:debugging` each session, or use [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/) with `xpinstall.signatures.required` set to `false` for a persistent install.

---

## Usage

### Moderation Queue

1. Go to `https://nextdoor.com/moderation_feed`
2. Click a flagged post
3. Click **⚖ AI Review** in the floating widget — the extension intercepts the API response automatically
4. Review the color-coded recommendation (green = Keep, red = Remove, amber = Maybe Remove)
5. The recommendation includes tag analysis, reasoning, and a suggested moderator comment

> If you're not on a moderation page, clicking ⚖ AI Review navigates you there.

### Post Panel

On any open Nextdoor post, click **📄 Post Panel** in the widget to open a side panel with:

- Full thread preview with commenter context
- **AI Chat** tab — ask questions about the post; the full thread is always included
- Mod History shortcut

### Additional Context

Before clicking "Analyze with AI", use the **Additional Context** field to describe anything the LLM can't see — images, videos, links. The LLM uses this as factual input only; moderator opinions in that field do not influence the vote.

---

## Configuration

| Setting | Description |
|---------|-------------|
| API Provider | OpenAI or Anthropic |
| API Key | Stored per-provider in `browser.storage.local` |
| Model | Provider-specific model list; validated on save |

Keys are validated against the live API before saving. Switching providers restores the previously saved key for that provider.

### Supported Models

**OpenAI:** GPT-4o, GPT-4o mini, o3, o4-mini

**Anthropic:** Claude Sonnet 4.6, Claude Haiku 4.5

---

## How It Works

```
1. User opens a flagged post on Nextdoor
2. Background script intercepts the ModerationFeed GraphQL API response
3. Parses moderationSummaryV3: post content, reports, votes, conversation thread
4. Content script enables the ⚖ AI Review button in the widget
5. User clicks AI Review → overlay opens with post metadata
6. User optionally adds context → clicks Analyze with AI
7. Background sends structured prompt to the configured LLM
8. LLM response parsed and displayed inline with vote card + reasoning
```

The extension uses `webRequest.filterResponseData` (Manifest V2) to intercept GraphQL responses — no polling, no page scraping.

---

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Store API configuration locally |
| `activeTab` | Access the current Nextdoor tab |
| `webRequest` / `webRequestBlocking` | Intercept ModerationFeed GraphQL responses |
| `*://*.nextdoor.com/*` | Run on Nextdoor pages |
| `*://*.anthropic.com/*` | Anthropic API calls |
| `*://*.openai.com/*` | OpenAI API calls |

---

## Development

```bash
npm run dev      # Watch mode with auto-rebuild
npm run build    # Production build → dist/
```

After rebuilding, click **Reload** next to the extension in `about:debugging`.

### Versioning

```bash
./scripts/cut-release.sh              # Tag current version, bump minor, begin next cycle
./scripts/cut-hotfix-start.sh <tag>   # Branch from a tag for a patch fix
./scripts/cut-hotfix-finish.sh        # Tag hotfix, merge back to main
```

---

## Privacy

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

---

## Disclaimer

This extension is not affiliated with or endorsed by Nextdoor. It is an independent tool to assist community moderators. All moderation decisions rest with the human moderator.

---

## License

[MIT](LICENSE)
