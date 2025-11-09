# Selector Test Guide

## Testing the Report Indicator Selector

### Quick Console Test

Open the browser console on a Nextdoor moderation page and run:

```javascript
// Test 1: Find report icons
const reportIcons = document.querySelectorAll('svg[data-icon="report-fill"]');
console.log(`Found ${reportIcons.length} reported comment(s)`);

// Test 2: Find parent comment containers
reportIcons.forEach((icon, index) => {
  const comment = icon.closest('[data-testid="comment-detail"]');
  if (comment) {
    const author = comment.querySelector('a[href*="detail_author"], a[href*="detail_commenter"]')?.textContent;
    const content = comment.querySelector('[data-testid="truncate-container"] [data-testid="styled-text"]')?.textContent;
    console.log(`\nReported Comment ${index + 1}:`);
    console.log(`Author: ${author}`);
    console.log(`Content: ${content?.substring(0, 100)}...`);
  }
});
```

### Expected Results

**On a page with reported comments:**
- `reportIcons.length` > 0
- Each icon has a parent `comment-detail` container
- You can extract author and content from each flagged comment

**On a page without reported comments:**
- `reportIcons.length` === 0
- No flagged comments to process

### Visual Verification

1. **Open DevTools** (F12)
2. **Run in Console:**
   ```javascript
   document.querySelectorAll('svg[data-icon="report-fill"]').forEach(icon => {
     icon.style.outline = '3px solid red';
     icon.closest('[data-testid="comment-detail"]').style.backgroundColor = '#fff3cd';
   });
   ```
3. **Expected Result:**
   - Red outline around report icons
   - Yellow background on flagged comment containers

### Comparison with Old Selector

Test the old unstable selector vs. new stable selector:

```javascript
// Old selector (will break on updates)
const oldMatches = document.querySelectorAll('.blocks-19xz1ve');
console.log('Old selector (.blocks-19xz1ve):', oldMatches.length);

// New selector (stable)
const newMatches = document.querySelectorAll('svg[data-icon="report-fill"]');
console.log('New selector (svg[data-icon="report-fill"]):', newMatches.length);

// Should match the same number of reported comments
if (oldMatches.length === newMatches.length) {
  console.log('✓ Both selectors work (for now)');
} else {
  console.warn('⚠ Selectors returned different counts - check DOM structure');
}
```

### Testing Edge Cases

```javascript
// Test: Multiple reported comments
const allReports = document.querySelectorAll('svg[data-icon="report-fill"]');
console.log(`Total reported comments: ${allReports.length}`);

// Test: Ensure selector doesn't match non-report icons
const allIcons = document.querySelectorAll('svg[data-icon]');
const reportIcons = document.querySelectorAll('svg[data-icon="report-fill"]');
console.log(`Total SVG icons: ${allIcons.length}`);
console.log(`Report icons only: ${reportIcons.length}`);
console.log(`✓ Selector is specific to report icons: ${reportIcons.length < allIcons.length}`);

// Test: Check icon uniqueness per comment
const commentContainers = new Set();
allReports.forEach(icon => {
  const comment = icon.closest('[data-testid="comment-detail"]');
  if (comment) commentContainers.add(comment);
});
console.log(`Unique flagged comments: ${commentContainers.size}`);
```

### Automated Test (Copy-Paste into Console)

```javascript
(function testReportSelector() {
  console.log('=== Report Indicator Selector Test ===\n');

  // Test 1: Selector exists
  const icons = document.querySelectorAll('svg[data-icon="report-fill"]');
  console.log(`✓ Test 1: Found ${icons.length} report indicator(s)`);

  if (icons.length === 0) {
    console.log('  ℹ No reported comments on this page (this is normal)');
    return;
  }

  // Test 2: Icons have correct structure
  let structureValid = true;
  icons.forEach((icon, i) => {
    const hasParent = icon.closest('[data-testid="comment-detail"]');
    if (!hasParent) {
      console.warn(`  ✗ Test 2: Icon ${i} has no comment-detail parent`);
      structureValid = false;
    }
  });
  if (structureValid) {
    console.log(`✓ Test 2: All icons have valid parent structure`);
  }

  // Test 3: Can extract data
  const firstComment = icons[0].closest('[data-testid="comment-detail"]');
  const hasAuthor = firstComment.querySelector('a[href*="detail_author"], a[href*="detail_commenter"]');
  const hasContent = firstComment.querySelector('[data-testid="truncate-container"] [data-testid="styled-text"]');

  if (hasAuthor && hasContent) {
    console.log(`✓ Test 3: Can extract author and content from flagged comments`);
  } else {
    console.warn(`✗ Test 3: Failed to extract data - check selectors`);
  }

  // Test 4: Selector stability
  const hasDataIcon = icons[0].hasAttribute('data-icon');
  const iconValue = icons[0].getAttribute('data-icon');
  console.log(`✓ Test 4: Icon has stable attribute: data-icon="${iconValue}"`);

  console.log('\n=== All Tests Complete ===');
})();
```

### When to Re-Test

1. **After Nextdoor updates** - If the extension stops working
2. **Before releasing updates** - Verify selectors still work
3. **When adding new features** - Ensure no selector conflicts

### Troubleshooting

**If selector returns 0 results:**
1. Check if you're on a moderation/reported content page
2. Verify there are actually reported comments visible
3. Inspect a reported comment in DevTools and check for:
   - `<svg>` element with `data-icon` attribute
   - Attribute value (should be "report-fill")
4. If attribute changed, update selector and document the change

**If selector returns wrong elements:**
1. Check if other icons use `data-icon="report-fill"`
2. Add additional specificity if needed (e.g., color, parent structure)
3. Consider using combined selector with `:has()` or similar
