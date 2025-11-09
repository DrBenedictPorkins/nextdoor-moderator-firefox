# Nextdoor DOM Selectors

This document contains the DOM selectors extracted from actual Nextdoor moderation pages.

## Analysis Date
2025-11-08

## Source
`resources/Moderation—Nextdoor.html`

## Key Selectors

### Original Post

| Element | Selector | Description |
|---------|----------|-------------|
| Post Container | `[data-testid="post-body"]` | Main container for the original post |
| Post Content | `[data-testid="post-body"] [data-testid="styled-text-wrapper"] [data-testid="styled-text"]` | The actual text content of the post |

**Example from HTML:**
```html
<div data-testid="post-body" class="_1m8rz6c1o _1m8rz6c1q _19tor6u1">
  <div class="blocks-6u6kae" data-testid="styled-text-wrapper">
    <span data-testid="styled-text">
      Just puzzling about gas prices...
    </span>
  </div>
</div>
```

### Comments

| Element | Selector | Description |
|---------|----------|-------------|
| Comment Container | `[data-testid="comment-detail"]` | Main container for a comment |
| Comment Body | `[data-testid="comment-detail-body"]` | The comment body area |
| Comment Content | `[data-testid="truncate-container"] [data-testid="styled-text"]` | The actual text content of the comment |

**Example from HTML:**
```html
<div data-testid="comment-detail" class="blocks-5k182e">
  <div data-testid="comment-detail-body" class="_1mxt86c3">
    <span data-testid="truncate-container">
      <div data-testid="styled-text-wrapper">
        <span data-testid="styled-text">
          Try voting RED !!!
        </span>
      </div>
    </span>
  </div>
</div>
```

### Flagged/Reported Comments

| Element | Selector | Description |
|---------|----------|-------------|
| Report Indicator | `.blocks-19xz1ve` | Container that only appears on reported comments (shows "1 report", "2 reports", etc.) |

**Usage:**
- This class appears **only** on reported comments
- Contains the report count text (e.g., "1 report")
- Contains the report reason tags (e.g., "Disrespectful")
- Use `.closest('[data-testid="comment-detail"]')` to find the parent comment container

**Example from HTML:**
```html
<div class="blocks-19xz1ve">
  <div class="blocks-1q6x145" data-testid="styled-text-wrapper">
    <span data-testid="styled-text">1 report</span>
  </div>
  <!-- Report icon and tags appear here -->
</div>
```

### Author Information

| Element | Selector | Description |
|---------|----------|-------------|
| Author Name Link | `a[href*="detail_author"]` | Link containing the author name for posts |
| Commenter Name Link | `a[href*="detail_commenter"]` | Link containing the author name for comments |
| Combined | `a[href*="detail_author"], a[href*="detail_commenter"]` | Matches both post authors and commenters |

**Example from HTML:**
```html
<!-- Post author -->
<a href="https://nextdoor.com/profile/01KNJzKDs5NhJqQHq/?is=detail_author">
  Joseph Mancinelli
</a>

<!-- Comment author -->
<a href="https://nextdoor.com/profile/01zBF2LBMP6bsBkQx/?is=detail_commenter">
  Carol Obrien
</a>
```

## Implementation in Extension

These selectors are configured in `/src/content/content.js`:

```javascript
const SELECTORS = {
  // Original post selectors
  originalPost: '[data-testid="post-body"]',
  originalPostContent: '[data-testid="post-body"] [data-testid="styled-text-wrapper"] [data-testid="styled-text"]',

  // Comment selectors
  commentContainer: '[data-testid="comment-detail"]',
  commentBody: '[data-testid="comment-detail-body"]',
  commentContent: '[data-testid="truncate-container"] [data-testid="styled-text"]',

  // Flagged/reported comment indicator
  reportIndicator: '.blocks-19xz1ve',

  // Author name
  authorName: 'a[href*="detail_author"], a[href*="detail_commenter"]',
};
```

## Finding Flagged Comments

To find all flagged comments:

```javascript
function findFlaggedComments() {
  const flaggedComments = [];
  const reportIndicators = document.querySelectorAll('.blocks-19xz1ve');

  reportIndicators.forEach((indicator) => {
    let commentContainer = indicator.closest('[data-testid="comment-detail"]');
    if (commentContainer) {
      flaggedComments.push(commentContainer);
    }
  });

  return flaggedComments;
}
```

## Notes

- **Specificity:** Nextdoor uses `data-testid` attributes extensively, which are more stable than class names
- **Class Names:** The `blocks-*` classes appear to be generated/hashed, but `.blocks-19xz1ve` is unique to report indicators
- **Nested Structure:** Content is deeply nested within multiple divs with styling classes
- **Reliability:** `data-testid` selectors are likely test infrastructure and should be stable across updates

## Testing

Sample text content from analyzed page:
- **Original Post Author:** Joseph Mancinelli
- **Original Post Text:** "Just puzzling about gas prices..."
- **Flagged Comment Author:** Carol Obrien
- **Flagged Comment Text:** "Try voting RED !!!"
- **Report Count:** "1 report"
- **Report Reason:** "Disrespectful"
