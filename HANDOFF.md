# HANDOFF.md - Nextdoor Moderator Extension

**Last Updated**: 2025-01-10
**Session Status**: Ready for Firefox testing
**Current Phase**: Built and ready to load as temporary add-on

---

## Project Overview

Firefox browser extension (Manifest V2) for Nextdoor community moderators that intercepts ModerationFeed GraphQL API responses, extracts detailed moderation metadata, and uses LLMs to provide independent content analysis with vote recommendations.

**Purpose**: Help moderators make better-informed decisions by:
- Displaying complete moderation context (votes, reports, reviewer comments)
- Providing AI analysis that independently evaluates report tags
- Generating concise comment suggestions for moderator votes
- Allowing moderators to add context about images/videos/links the LLM can't see

**Current Status**: 
- ✅ Fully functional extension built and ready to deploy
- ✅ Git repository initialized with 2 commits
- ✅ Documentation complete (README.md, CLAUDE.md)
- 🔄 Ready for Firefox temporary add-on loading and testing

---

## Session Goals & Progress

### What We Accomplished

1. **Fixed UI Positioning** - Moved "Analyze Post" button from `top: 20px` to `top: 80px` to avoid overlap with Nextdoor navigation icons
2. **Improved Vote Totals Calculation** - Replaced unreliable regex text parsing with direct counting from `individual_report` reviewer data
3. **Added Additional Context Feature** - Moderators can now describe images/videos/links in a textarea before analysis
4. **Enhanced LLM Prompt** - Updated to emphasize independence, focus on flagged content only, and provide structured output with comment suggestions
5. **Integrated Inline Analysis** - AI analysis now displays within the main overlay instead of separate popup
6. **Git Repository Setup** - Initialized repo, created .gitignore, made initial commit + documentation update
7. **Documentation** - Comprehensive updates to CLAUDE.md and README.md with accurate implementation details

---

## Current State

### Built Extension
```bash
# Last build completed successfully
dist/
├── manifest.json
├── src/
│   ├── background/background.js (15.51 kB)
│   ├── content/content-api.js (32.59 kB)
│   └── popup/
└── icons/
```

### Git Status
```
Branch: master
Commits: 2
Latest: b990e3f "Update documentation with implementation details"
Working tree: Clean
```

### Next Action Required
**Load extension in Firefox as temporary add-on:**
1. Open Firefox → `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `dist/manifest.json`
4. Configure API key/endpoint in popup
5. Test on Nextdoor moderation feed

---

## Technical Context

### Architecture

**Three-Part Extension:**

1. **Background Script** (`src/background/background.js`)
   - Intercepts ModerationFeed GraphQL via `webRequest.filterResponseData`
   - Parses `moderationSummaryV3` data structure
   - Manages LLM API calls (OpenAI/Anthropic/custom)
   - Optional logging: `ENABLE_LLM_LOGGING = true` saves to Downloads

2. **Content Script** (`src/content/content-api.js`)
   - Displays "Analyze Post" button at `top: 80px; right: 20px`
   - Creates overlay with moderation metadata
   - Calculates vote totals by counting reviewer `voteType` values
   - Handles additional context textarea input
   - Displays formatted AI analysis inline

3. **Popup UI** (`src/popup/`)
   - API configuration (key, endpoint, model)
   - Settings persist in `browser.storage.local`

### Key Implementation Details

**Vote Totals Calculation** (Lines 451-462 in content-api.js):
```javascript
// Count actual votes from individual_report entries
moderationDetails.reports.forEach((report) => {
  if (report.type === 'individual_report') {
    if (report.voteType === 'keep') keepCount++;
    else if (report.voteType === 'abstain') maybeRemoveCount++;
    else if (report.voteType === 'remove') removeCount++;
  }
});
```
- **Why**: More reliable than regex parsing text patterns like "* 1 * 2"
- **Handles**: 1, 2, or 3 votes without fallback to raw text

**Vote Type Labels**:
- `keep` → "Keep" (green ✓)
- `abstain` → "Maybe remove" (grey −) - NOT "Abstain"
- `remove` → "Remove" (red ✗)
- `report` → "Report" (orange 🚩)

**Additional Context Feature** (Lines 881-903 in content-api.js):
- Textarea above "Analyze with AI" button
- Sent to background as `additionalContext` parameter
- LLM uses for analysis AND answers moderator questions in separate section
- Example inputs:
  - "Post includes photo of political yard sign"
  - "Does this count as harassment if they're a business owner?"

**LLM Prompt Structure** (background.js lines 191-266):
- Emphasizes **independence** from reporter tags/voting trends
- Warns about "public shaming" tags being misapplied to political critiques
- Focuses analysis on **flagged content only** (not entire thread)
- Requires tag validity: Valid / Doesn't Apply / Borderline
- Decision logic: all "Doesn't Apply" → Keep; majority "Valid" → Remove; mixed → Maybe Remove
- Output format:
  1. Tag Analysis
  2. Vote Suggestion (Keep/Remove/Maybe Remove)
  3. Why (brief explanation)
  4. Comment Suggestion (5-10 words)
  5. Moderator Questions/Comments (if context provided)
  6. Additional Context (voting trends, tone, mitigating factors)

---

## Files Modified (This Session)

### Core Functionality
1. **src/content/content-api.js**
   - Line 1432: Button position `top: 80px` (was `top: 20px`)
   - Lines 451-462: Vote totals calculation from actual reviewer data
   - Lines 474-492: Skip text-based vote totals sections
   - Lines 881-903: Added "Additional Context" textarea
   - Lines 945-1008: Analyze button event listener with context capture
   - Lines 1259-1301: Updated analysisResult handler for inline display
   - Lines 1303-1329: Updated analysisError handler for inline display

2. **src/background/background.js**
   - Lines 144-150: Additional context parameter support
   - Lines 191-266: Enhanced LLM prompt with independence emphasis, tag validity framework
   - Line 223: Additional context inserted in prompt
   - Line 259: "Moderator Questions/Comments" section (conditional)
   - Lines 404-407: Message handler extracts additionalContext

### Documentation
3. **CLAUDE.md** - Comprehensive project documentation
   - API interception strategy
   - Vote totals calculation approach
   - Vote type label mappings
   - Additional context feature documentation
   - LLM prompt structure and output format
   - Updated for Manifest V2

4. **README.md** - User-facing documentation
   - Detailed Firefox temporary add-on installation steps
   - Complete usage workflow
   - Updated features list
   - Practical troubleshooting steps
   - Correct architecture descriptions

5. **.gitignore** - Standard exclusions
   - node_modules, dist, logs, IDE files, llm-*.md

---

## Key Decisions Made

### Recent (High Priority)

1. **Vote Totals from Actual Data** (Most Recent)
   - **Decision**: Count votes from `individual_report.voteType` instead of parsing text patterns
   - **Rationale**: Text patterns unreliable ("* 1", "* 1 * 1", "* 1 * 2 * 3" all different)
   - **Impact**: Handles all vote count scenarios without regex failures

2. **Additional Context as Dual-Purpose Input**
   - **Decision**: Use textarea for both context AND moderator questions
   - **Rationale**: Moderators need to describe media (images/videos) AND ask specific questions
   - **Implementation**: LLM uses context for analysis + answers questions in separate section

3. **Inline Analysis Display**
   - **Decision**: Display AI analysis in main overlay, not separate popup
   - **Rationale**: User wanted single view without popup switching
   - **Implementation**: Analysis container below "Analyze with AI" button, clears on re-click

4. **Button Positioning**
   - **Decision**: `top: 80px; right: 20px`
   - **Rationale**: `top: 20px` overlapped Nextdoor's bell/message icons
   - **Impact**: Button now visible without UI conflicts

### Earlier Session

5. **Independent Tag Analysis**
   - **Decision**: LLM must independently evaluate tags, not rubber-stamp reports
   - **Rationale**: User found automated/human reports often wrong (e.g., "public shaming" on political critiques)
   - **Implementation**: Prompt emphasizes independence, provides validity framework

6. **Comment Suggestions Format**
   - **Decision**: Concise 5-10 word phrases, not full sentences
   - **Rationale**: User wanted quick, scannable moderator comments
   - **Format**: "reason - context" (e.g., "political critique - public figure, not personal attack")

7. **Temporary Add-on Approach**
   - **Decision**: Accept temporary add-on workflow (reload on Firefox restart)
   - **Rationale**: Simpler than Firefox Developer Edition profile management
   - **Note**: API credentials persist via `browser.storage.local`

---

## Outstanding Tasks

### Immediate (User Ready to Test)
1. **Load extension in Firefox** - User needs to test as temporary add-on
2. **Configure API credentials** - Set up LLM endpoint (OpenAI/Anthropic/custom)
3. **Test on real moderation content** - Verify data extraction and analysis quality

### Future Enhancements (Not Urgent)
- None identified; extension is feature-complete for current use case
- May need prompt tuning after real-world testing

### Known Issues
- None currently; all identified issues resolved this session

---

## Commands Used

### Build & Development
```bash
npm install           # Initial setup (already done)
npm run build         # Production build (last run: successful)
npm run dev           # Development mode with auto-rebuild
```

### Git Operations
```bash
git init
git add -A
git commit -m "Initial commit: Firefox extension for Nextdoor moderation with AI analysis"
git commit -m "Update documentation with implementation details"
git status            # Clean working tree
git log --oneline     # 2 commits: 770df0c, b990e3f
```

### Firefox Loading (Next Step)
```
1. Open Firefox
2. Navigate to: about:debugging#/runtime/this-firefox
3. Click "Load Temporary Add-on"
4. Select: /Users/makram/dev/firefox-extensions/nextdoor-moderator-extension/dist/manifest.json
```

---

## Testing Status

### Not Yet Tested
- ❌ Loading in Firefox as temporary add-on
- ❌ API interception on real Nextdoor pages
- ❌ LLM analysis quality with real moderation data
- ❌ Additional context feature with actual use cases
- ❌ Vote totals display with various vote counts

### Verified (Development)
- ✅ Build completes successfully
- ✅ Vote totals calculation logic (code review)
- ✅ Additional context parameter passing (code review)
- ✅ Inline analysis display structure (code review)
- ✅ Git repository initialized

---

## Environment Details

### Development Machine
- **OS**: macOS (Darwin 24.3.0)
- **Location**: `/Users/makram/dev/firefox-extensions/nextdoor-moderator-extension`
- **Node.js**: Installed (npm available)
- **Firefox**: Regular Firefox (not Developer Edition)

### Build Configuration
- **Manifest Version**: V2 (NOT V3)
- **Build Tool**: Vite 7.2+
- **Package Manager**: npm
- **Output**: `dist/` directory

### Extension Permissions (Manifest V2)
- `storage` - API config persistence
- `activeTab` - Current tab access
- `*://*.nextdoor.com/*` - Nextdoor domain
- `webRequest` - Network interception
- `webRequestBlocking` - Request modification
- `downloads` - LLM log saving

---

## Code Patterns & Conventions

### Vote Type Handling
Always use string comparison for vote types:
```javascript
if (report.voteType === 'keep') { /* ... */ }
else if (report.voteType === 'abstain') { /* ... */ }  // "Maybe remove"
else if (report.voteType === 'remove') { /* ... */ }
```

### Message Passing
Content script ↔ Background script via `browser.runtime.sendMessage`:
```javascript
// Content → Background
browser.runtime.sendMessage({
  action: 'analyzeContent',
  data: { originalPost, flaggedContent, conversationThread, additionalContext }
});

// Background → Content
browser.tabs.sendMessage(tabId, {
  action: 'analysisResult',
  analysis: { analysisText: '...' }
});
```

### Console Logging Prefixes
- Background script: `[Background]`
- Content script: `[Content]`
- Debug reports: `[DEBUG REPORTS]`

### LLM Logging
Toggle via `ENABLE_LLM_LOGGING` flag in background.js:
```javascript
const ENABLE_LLM_LOGGING = true;  // Saves to Downloads/llm-request.md, llm-response.md
```

---

## Context Notes

### User Preferences & Feedback
- User wants minimal changes to scope - only what was requested
- Prefers direct, concise responses without excessive praise
- Values clean, simple solutions over complex ones
- Emphasized: "DO NOT change ANY code the user didn't ask you to change"

### Design Philosophy
- **Independent Analysis**: LLM must not blindly follow reporter tags or voting trends
- **Political Speech Protection**: Critiques of public figures/candidates generally permitted
- **Focus on Flagged Content**: Analysis targets specific flagged post/comment, not entire thread
- **Context Over Text**: Original post and thread provided for context only, not judgment

### Nextdoor-Specific Context
- Moderation feed at `nextdoor.com/moderation_feed`
- GraphQL API endpoint: contains `moderationSummaryV3` field
- Vote types: Keep, Maybe remove (not "Abstain"), Remove
- Common false positive: "Public shaming" tags on political critiques

### Temporary Add-on Limitations
- Extension removed when Firefox closes
- Must reload via `about:debugging` each session (~10 seconds)
- **API credentials persist** (stored in `browser.storage.local`)
- No certificate/signing required for development use

---

## Next Steps

### Immediate Actions (User to Perform)
1. **Load extension in Firefox**
   - `about:debugging#/runtime/this-firefox`
   - Load Temporary Add-on
   - Select `dist/manifest.json`

2. **Configure API settings**
   - Click extension icon
   - Enter API key, endpoint, model
   - Save configuration

3. **Test on Nextdoor**
   - Navigate to moderation feed
   - Click flagged post
   - Verify "Analyze Post" button appears and enables
   - Test overlay display
   - Test additional context input
   - Test AI analysis

### If Issues Arise
- Check browser console (F12) for `[Content]` or `[Background]` messages
- Verify GraphQL interception: look for "Intercepted ModerationFeed" log
- Enable LLM logging to debug prompt/response
- Check `about:debugging` background script inspector for errors

### Future Development (If Needed)
- Prompt tuning based on real-world analysis quality
- Adjusting tag validity framework if needed
- Adding more LLM providers (currently supports OpenAI/Anthropic/custom)

---

## Handoff Instructions

### For New Claude Session

**Project Type**: Firefox browser extension for Nextdoor moderation assistance

**Current State**: Built and ready for Firefox testing. Git repository initialized with 2 commits. All code complete and documented.

**Key Files to Know**:
- `src/content/content-api.js` - Content script, button UI, overlay display, vote calculation
- `src/background/background.js` - GraphQL interception, LLM API calls, prompt engineering
- `CLAUDE.md` - Comprehensive technical documentation
- `README.md` - User installation and usage guide

**If User Reports Issues**:
1. Check which phase: loading extension, API interception, or LLM analysis
2. Review console logs (`[Content]` and `[Background]` prefixes)
3. Verify temporary add-on loaded successfully
4. Check GraphQL response structure if data extraction fails

**If User Requests Changes**:
1. Review CLAUDE.md for architecture understanding
2. Follow established patterns (vote type handling, message passing)
3. Maintain Manifest V2 compatibility
4. Keep vote totals calculation from actual data (not text parsing)
5. Preserve additional context dual-purpose functionality

**Important Constraints**:
- Manifest V2 (NOT V3)
- Vote labels: "Maybe remove" not "Abstain"
- Button position: `top: 80px; right: 20px`
- LLM prompt emphasizes independence from tags/votes
- Analysis displays inline in overlay, not separate popup

**User Workflow**:
User loads extension → navigates to Nextdoor moderation feed → clicks flagged post → clicks "Analyze Post" button → reviews metadata → optionally adds context → clicks "Analyze with AI" → reviews AI recommendation → makes moderation decision

**Success Criteria**: Extension helps moderator make better-informed, independent decisions by providing complete context and AI analysis that questions potentially wrong tags.

---

**End of Handoff Document**
