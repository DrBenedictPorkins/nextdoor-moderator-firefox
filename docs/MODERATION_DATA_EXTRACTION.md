# Moderation Data Extraction - Technical Documentation

## Overview

The extension extracts detailed moderation metadata from the Nextdoor `ModerationFeed` GraphQL API response and displays it in a user-friendly preview popup.

## Data Source: `moderationSummaryV3`

The GraphQL fragment `moderation_summary_moderationSummaryV2` is applied to all flagged content (posts and comments). This fragment contains rich moderation information structured as follows:

### Schema Structure

```graphql
fragment moderation_summary_moderationSummaryV2 on ModerationSummaryV2 {
  reportModerationEventsSummary {
    contents {
      type
      # Various content types:
      # - ModerationContentRowMainTitle
      # - ModerationContentRowMainDescription
      # - ModerationContentRowSectionTitle
      # - ModerationContentRow (reason + count)
    }
  }
  voteModerationEventsSummary {
    contents {
      # Similar structure to reports
    }
  }
  ... on ModerationSummaryCollapsedV2 {
    trackingMetadata
    addNotesModerationEventsSummary { ... }
    leftText { text }
    rightText { text }
  }
  ... on ModerationSummaryExpandedV2 {
    trackingMetadata
    title { text }
    previewText { text }
  }
}
```

### Data Location in API Response

The moderation summary appears in two places:

1. **Feed Item Level** (flagged posts):
   ```javascript
   data.me.moderationFeed.feedItems[i].moderationInfo.moderationSummaryV3
   ```

2. **Comment Level** (flagged comments):
   ```javascript
   data.me.moderationFeed.feedItems[i].post.comments.pagedComments.edges[j].node.comment.moderationInfo.moderationSummaryV3
   ```

## Extracted Metadata

### 1. Report Details (`reportModerationEventsSummary`)

**Structure**: Array of `contents` objects with different types:

- **ModerationContentRowMainTitle**: Main heading for the report section
  - `title.text` - Title text (e.g., "Community Reports")

- **ModerationContentRowMainDescription**: Description text
  - `description.text` - Explanation text

- **ModerationContentRowSectionTitle**: Section headers
  - `text.text` - Section name (e.g., "Reasons for reporting")

- **ModerationContentRow**: Individual report reasons with counts
  - `leftText.text` - Report reason (e.g., "Harassment", "Spam", "Hate speech")
  - `rightText.text` - Number of reports for this reason (e.g., "3", "1")

- **ModerationEventSummary**: Individual reporter details with specific report type
  - `topContent.text.text` - Multi-line text containing:
    - Line 1: Reporter name (e.g., "Erin F.")
    - Line 2: Location and timestamp (e.g., "High Ridge Rd/Nichols Ave • 1w")
    - Line 3: Specific report type (e.g., "* Public shaming ›")
  - `leftContent.icon.icon` - Vote indicator: "BLOCKS_KEEP_FILLED", "BLOCKS_REMOVE_FILLED", or null
  - `bottomContent.text.text` - Optional additional notes or context

**Example Parsed Output**:
```javascript
{
  reports: [
    { type: 'title', text: 'Vote totals' },
    { type: 'section', text: '* 8   * 5' },  // 8 keep, 5 remove
    { type: 'title', text: 'Reviewers' },
    {
      type: 'individual_report',
      reporterName: 'Erin F.',
      locationTime: 'High Ridge Rd/Nichols Ave • 1w',
      reportType: 'Public shaming',
      voteType: 'report'  // 'keep', 'remove', or 'report'
    },
    {
      type: 'individual_report',
      reporterName: 'Laura M.',
      locationTime: 'Ridgeway • 1w',
      reportType: 'Public shaming',
      voteType: 'report'
    }
  ],
  totalReports: 2  // Count of individual reports
}
```

### 2. Community Votes (`voteModerationEventsSummary`)

**Structure**: Similar to reports, contains community upvotes/downvotes

- **ModerationContentRow**: Vote types with counts
  - `leftText.text` - Vote type (e.g., "Upvotes", "Downvotes")
  - `rightText.text` - Number of votes

- **ModerationEventSummary**: Individual voter details
  - `topContent.text.text` - Voter name and location/time
  - `leftContent.icon.icon` - "BLOCKS_KEEP_FILLED" (keep) or "BLOCKS_REMOVE_FILLED" (remove)

**Example Parsed Output**:
```javascript
{
  votes: [
    { type: 'row', reason: 'Should be removed', count: '15' },
    { type: 'row', reason: 'Should stay', count: '3' },
    {
      type: 'individual_vote',
      voterName: 'Ginny Peluso',
      locationTime: 'Summer St / Bedford St • 5d',
      voteType: 'keep'
    },
    {
      type: 'individual_vote',
      voterName: 'Susan B.',
      locationTime: 'Ridgeway • 6d',
      voteType: 'remove'
    }
  ],
  totalVotes: 18
}
```

### 3. Moderator Notes (`addNotesModerationEventsSummary`)

**Structure**: Array of moderator-added notes

- **ModerationContentRow**: Each note as a row
  - `leftText.text` - The note text

**Example Parsed Output**:
```javascript
{
  notes: [
    { text: 'User warned on 2024-01-15' },
    { text: 'Previous violation in October' }
  ],
  totalNotes: 2
}
```

### 4. Collapsed View Summary (Fallback)

When the full breakdown isn't available, the collapsed view provides:

- `leftText.text` - Summary text (e.g., "6 community reports")
- `rightText.text` - Additional count or status

## Implementation Details

### Parsing Function: `parseModerationSummary()`

**Location**: `src/content/content-api.js:14-107`

**Input**: `moderationSummaryV3` object from GraphQL response

**Output**: Structured object with:
```javascript
{
  type: 'ModerationSummaryCollapsedV2' | 'ModerationSummaryExpandedV2',
  reports: Array<{type, text?, reason?, count?}>,
  votes: Array<{type, reason, count}>,
  notes: Array<{text}>,
  totalReports: number,
  totalVotes: number,
  totalNotes: number,
  collapsedLeftText?: string,
  collapsedRightText?: string
}
```

### Display Function: `formatModerationDetails()`

**Location**: `src/content/content-api.js:241-329`

**Purpose**: Converts parsed moderation details into styled HTML for the overlay

**Sections Rendered**:

1. **Reports Summary** (red background `#ffebee`):
   - Title showing total count
   - Breakdown of each report reason with count
   - Example: "📊 Reports Summary (6 total)"

2. **Community Votes** (blue background `#e3f2fd`):
   - Title showing total votes
   - Vote types with counts
   - Example: "👍 Community Votes (18 total)"

3. **Moderator Notes** (orange background `#fff3e0`):
   - Numbered list of notes
   - Example: "📝 Moderator Notes (2 total)"

4. **Fallback Display** (gray background `#f5f5f5`):
   - Shows collapsed view text when detailed breakdown isn't available

## Example UI Output

When a flagged comment has the following data (from actual ModerationFeed.json):
- 2 "Public shaming" reports from specific users
- 8 "keep" votes and 5 "remove" votes from community reviewers

The overlay displays:

```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Reports Summary (2 total)                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Vote totals                                             │ │
│ │ * 8   * 5                                               │ │
│ │                                                         │ │
│ │ Reviewers                                               │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ 🚩 Erin F.  High Ridge Rd/Nichols Ave • 1w         │ │ │
│ │ │ → Public shaming                                    │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ 🚩 Laura M.  Ridgeway • 1w                          │ │ │
│ │ │ → Public shaming                                    │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 👍 Community Votes (13 total)                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✅ Ginny Peluso  Summer St / Bedford St • 5d            │ │
│ │ Keep content                                            │ │
│ │                                                         │ │
│ │ ✅ Vitaliy R.  Bedford St/4th St • 6d                   │ │
│ │ Keep content                                            │ │
│ │                                                         │ │
│ │ ❌ Susan B.  Ridgeway • 6d                              │ │
│ │ Remove content                                          │ │
│ │ ... (10 more voters)                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Background Script** (`background.js:189-266`):
   - Intercepts `ModerationFeed` GraphQL API call
   - Uses `webRequest.filterResponseData()` to capture response
   - Parses JSON and sends to content script via `moderationDataReady` message

2. **Content Script** (`content-api.js`):
   - Receives data in `moderationFeedData` variable
   - When "Analyze Post" clicked, calls `extractModerationData()`
   - Calls `parseModerationSummary()` for each flagged item
   - Calls `formatModerationDetails()` to render HTML
   - Displays in overlay popup

3. **LLM Analysis**:
   - Moderation details are included in the data sent to background
   - Can be incorporated into AI prompt for context-aware moderation decisions

## Benefits of This Approach

1. **Comprehensive Context**: LLM receives full report breakdown, not just content
2. **No DOM Parsing**: Reliable API-based extraction vs. fragile DOM selectors
3. **Real-time Updates**: Captures latest moderation state with each API call
4. **Multiple Report Types**: Distinguishes between reports, votes, and moderator notes
5. **Count Aggregation**: Automatically calculates totals for quick assessment

## Future Enhancements

Potential additions to extraction:

- `trackingMetadata` for analytics
- `backgroundColor` for UI customization
- Timestamp of report events
- Reporter identity (if available and appropriate)
- Historical moderation actions
- Severity scores or priority flags
