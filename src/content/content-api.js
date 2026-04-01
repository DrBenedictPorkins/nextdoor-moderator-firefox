/**
 * Content script for Nextdoor Moderator Extension
 * Uses API interception to capture moderation feed data
 */

console.log('[Nextdoor Moderator] Content script loaded (API mode)');

// Store the latest moderation feed data
let moderationFeedData = null;
let dataIsValid = false;

// --- Post review data persistence (7-day TTL) ---
const REVIEW_STORAGE_PREFIX = 'nd_review_';
const REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getReviewStorageKey(postId) {
  return `${REVIEW_STORAGE_PREFIX}${postId}`;
}

async function savePostReview(postId, data) {
  if (!postId) return;
  const record = {
    ...data,
    savedAt: Date.now(),
    expiresAt: Date.now() + REVIEW_TTL_MS,
  };
  await browser.storage.local.set({ [getReviewStorageKey(postId)]: record });
}

async function loadPostReview(postId) {
  if (!postId) return null;
  const key = getReviewStorageKey(postId);
  const result = await browser.storage.local.get(key);
  const record = result[key];
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    await browser.storage.local.remove(key);
    return null;
  }
  return record;
}

async function clearPostReview(postId) {
  if (!postId) return;
  await browser.storage.local.remove(getReviewStorageKey(postId));
}

// Purge expired review records on load
(async function purgeExpiredReviews() {
  const all = await browser.storage.local.get(null);
  const expired = Object.keys(all).filter(k =>
    k.startsWith(REVIEW_STORAGE_PREFIX) && all[k].expiresAt && Date.now() > all[k].expiresAt
  );
  if (expired.length > 0) {
    await browser.storage.local.remove(expired);
    console.log(`[Nextdoor Moderator] Purged ${expired.length} expired review records`);
  }
})();

/**
 * Parse moderationSummaryV3 to extract human-readable details
 */
function parseModerationSummary(moderationSummary) {
  if (!moderationSummary) return null;

  const details = {
    type: moderationSummary.__typename || 'Unknown',
    reports: [],
    votes: [],
    notes: [],
    totalReports: 0,
    totalVotes: 0,
    totalNotes: 0,
  };

  // Extract report details
  const reportSummary = moderationSummary.reportModerationEventsSummary;
  if (reportSummary?.contents) {
    reportSummary.contents.forEach((content) => {
      if (content.type === 'ModerationContentRowMainTitle' && content.title?.text) {
        details.reports.push({
          type: 'title',
          text: content.title.text,
        });
      } else if (content.type === 'ModerationContentRowMainDescription' && content.description?.text) {
        details.reports.push({
          type: 'description',
          text: content.description.text,
        });
      } else if (content.type === 'ModerationContentRowSectionTitle' && content.text?.text) {
        details.reports.push({
          type: 'section',
          text: content.text.text,
        });
      } else if (content.type === 'ModerationContentRow' && content.leftText?.text) {
        // Extract report reason and count
        const leftText = content.leftText.text;
        const rightText = content.rightText?.text || '';
        details.reports.push({
          type: 'row',
          reason: leftText,
          count: rightText,
        });
      } else if (content.type === 'ModerationEventSummary') {
        // Individual reporter with report type
        const topText = content.topContent?.text?.text || '';
        const icon = content.leftContent?.icon?.icon || '';
        const bottomText = content.bottomContent?.text?.text || '';

        // Parse the text: "Name\nLocation • Time\n* Report Type ›"
        const lines = topText.split('\n');
        const reporterName = lines[0] || '';
        const locationTime = lines[1] || '';
        const reportType = lines[2] ? lines[2].replace(/^\*\s*/, '').replace(/\s*›\s*$/, '').trim() : '';

        details.reports.push({
          type: 'individual_report',
          reporterName,
          locationTime,
          reportType,
          additionalNote: bottomText,
          voteType: icon.includes('KEEP') ? 'keep' : icon.includes('REMOVE') ? 'remove' : icon.includes('NEUTRAL') ? 'abstain' : 'report',
        });
      }
    });
  }

  // Extract vote details
  const voteSummary = moderationSummary.voteModerationEventsSummary;
  if (voteSummary?.contents) {
    let isVoteTotalsSection = false;

    voteSummary.contents.forEach((content) => {
      // Debug logging for vote content
      console.log('[DEBUG] Vote content type:', content.type);
      console.log('[DEBUG] Vote content:', JSON.stringify(content, null, 2));

      // Check for section title indicating vote totals
      if (content.type === 'ModerationContentRowSectionTitle' && content.text?.text) {
        const sectionTitle = content.text.text.toLowerCase();
        if (sectionTitle.includes('vote total')) {
          isVoteTotalsSection = true;
          details.votes.push({
            type: 'section',
            text: content.text.text,
          });
        }
      } else if (content.type === 'ModerationContentRow' && content.leftText?.text) {
        const leftText = content.leftText.text;
        const rightText = content.rightText?.text || '';
        console.log('[DEBUG] Vote row - leftText:', leftText, 'rightText:', rightText, 'isVoteTotals:', isVoteTotalsSection);
        details.votes.push({
          type: 'row',
          reason: leftText,
          count: rightText,
          isVoteTotals: isVoteTotalsSection,
        });
      } else if (content.type === 'ModerationEventSummary') {
        // Individual voter
        isVoteTotalsSection = false; // Reset when we hit individual voters
        const topText = content.topContent?.text?.text || '';
        const icon = content.leftContent?.icon?.icon || '';
        const bottomText = content.bottomContent?.text?.text || '';

        const lines = topText.split('\n');
        const voterName = lines[0] || '';
        const locationTime = lines[1] || '';

        details.votes.push({
          type: 'individual_vote',
          voterName,
          locationTime,
          additionalNote: bottomText,
          voteType: icon.includes('KEEP') ? 'keep' : icon.includes('REMOVE') ? 'remove' : icon.includes('NEUTRAL') ? 'abstain' : 'unknown',
        });
      }
    });
  }

  // Extract notes
  const notesSummary = moderationSummary.addNotesModerationEventsSummary;
  if (notesSummary?.contents) {
    notesSummary.contents.forEach((content) => {
      if (content.type === 'ModerationContentRow' && content.leftText?.text) {
        details.notes.push({
          text: content.leftText.text,
        });
      }
    });
  }

  // Calculate totals from row counts AND individual reports
  const rowReportCount = details.reports
    .filter((r) => r.type === 'row' && r.count)
    .reduce((sum, r) => sum + (parseInt(r.count) || 0), 0);

  const individualReportCount = details.reports
    .filter((r) => r.type === 'individual_report')
    .length;

  details.totalReports = Math.max(rowReportCount, individualReportCount);

  const rowVoteCount = details.votes
    .filter((v) => v.type === 'row' && v.count)
    .reduce((sum, v) => sum + (parseInt(v.count) || 0), 0);

  const individualVoteCount = details.votes
    .filter((v) => v.type === 'individual_vote')
    .length;

  details.totalVotes = Math.max(rowVoteCount, individualVoteCount);

  details.totalNotes = details.notes.length;

  // Extract collapsed view text if available
  if (moderationSummary.leftText?.text) {
    details.collapsedLeftText = moderationSummary.leftText.text;
  }
  if (moderationSummary.rightText?.text) {
    details.collapsedRightText = moderationSummary.rightText.text;
  }

  return details;
}

/**
 * Extract moderation data from API response
 */
function extractModerationData() {
  console.log('[Content] extractModerationData() called');
  console.log('[Content] moderationFeedData exists:', !!moderationFeedData);
  console.log('[Content] moderationFeedData value:', moderationFeedData);

  if (!moderationFeedData) {
    console.error('[Content] No moderation feed data available');
    return {
      success: false,
      error: 'No moderation feed data available. Try refreshing the page.',
    };
  }

  try {
    const feedItems = moderationFeedData?.data?.me?.moderationFeed?.feedItems;

    if (!feedItems || feedItems.length === 0) {
      return {
        success: false,
        error: 'No feed items found in API response',
      };
    }

    // Get the first feed item (the current post being viewed)
    const feedItem = feedItems[0];
    const post = feedItem.post;

    if (!post) {
      return {
        success: false,
        error: 'No post data found in feed item',
      };
    }

    // Extract original post data
    // Use styledBody.text if available (contains full text including title), otherwise fall back to body
    const postContent = post.styledBody?.text || post.body || '';

    // Check for media attachments (images, videos, links)
    const mediaAttachments = post.mediaAttachments || [];
    const imageUrls = mediaAttachments.filter(m => m.type === 'PHOTO').map(m => m.url).filter(Boolean);
    const videoCount = mediaAttachments.filter(m => m.type === 'VIDEO').length;
    // Check for link/URL attachments (shared posts, external links)
    const postUrl = post.url || post.link || post.sharedPost?.url || '';
    const hasLink = !!postUrl || !!post.sharedPost;
    const hasMedia = mediaAttachments.length > 0 || hasLink;
    const mediaTypes = [
      ...mediaAttachments.map(m => m.type),
      ...(hasLink ? ['LINK'] : [])
    ].join(', ') || '';

    const originalPost = {
      id: post.id,
      legacyId: feedItem.legacyAnalyticsId,
      content: postContent || (hasLink ? `[Link: ${postUrl || 'shared post'}]` : ''),
      hasMedia: hasMedia,
      mediaTypes: mediaTypes,
      mediaCount: mediaAttachments.length + (hasLink ? 1 : 0),
      imageUrls: imageUrls,
      videoCount: videoCount,
      author: post.author?.displayName || 'Unknown',
      authorUrl: post.author?.url || '',
      createdAt: post.createdAt?.asDateTime?.relativeTime || '',
      neighborhood: post.author?.originationNeighborhood?.shortName || '',
    };

    // Extract moderation info with details
    const moderationInfo = {
      hasModerationSummary: !!feedItem.moderationInfo?.moderationSummaryV3,
      moderationSummary: feedItem.moderationInfo?.moderationSummaryV3 || null,
    };

    // Parse moderation summary for display-friendly format
    let moderationDetails = null;
    if (moderationInfo.moderationSummary) {
      moderationDetails = parseModerationSummary(moderationInfo.moderationSummary);
    }

    // Recursively search for flagged comments at any depth and build conversation threads
    const flaggedComments = [];

    /**
     * Recursively search comments and nested replies for flagged content
     * @param {Array} edges - Array of comment edges from GraphQL response
     * @param {Array} parentThread - Array of parent comments leading to this level
     * @param {number} depth - Current nesting depth
     * @param {Array} allComments - Collection of all processed comments (for sibling search)
     */
    function findFlaggedCommentsRecursive(edges, parentThread = [], depth = 0, allComments = []) {
      if (!edges || edges.length === 0) return;

      edges.forEach((edge) => {
        const comment = edge.node?.comment;
        if (!comment) return;

        // Use styledBody.text if available (full text), otherwise fall back to body
        const commentContent = comment.styledBody?.text || comment.body || '';

        const commentData = {
          id: comment.id,
          legacyId: comment.legacyCommentId,
          content: commentContent,
          author: comment.author?.displayName || 'Unknown',
          authorUrl: comment.author?.url || '',
          authorUserId: comment.author?.user?.id || null,  // Store user ID for matching
          createdAt: comment.createdAt?.asDateTime?.relativeTime || '',
          createdAtEpoch: comment.createdAt?.epochMillis || null,  // Store timestamp for filtering
          depth: depth,
          tags: comment.tags || [],  // Store tags array
        };

        // Add this comment to the global collection for sibling search
        allComments.push(commentData);

        // Check if this comment is flagged
        if (comment.moderationInfo?.moderationSummaryV3) {
          const commentModerationDetails = parseModerationSummary(comment.moderationInfo.moderationSummaryV3);

          // Build smart minimal conversation thread based on tags
          const smartThread = buildSmartConversationThread(commentData, parentThread, allComments);

          flaggedComments.push({
            ...commentData,
            moderationSummary: comment.moderationInfo.moderationSummaryV3,
            moderationDetails: commentModerationDetails,
            // Smart conversation thread: only relevant context
            conversationThread: smartThread,
          });
        }

        // Recursively search nested replies
        // Note: Replies are at edge.node.replies.edges, NOT comment.pagedNestedReplies
        const nestedReplies = edge.node?.replies?.edges || [];
        if (nestedReplies.length > 0) {
          findFlaggedCommentsRecursive(
            nestedReplies,
            [...parentThread, commentData], // Add current comment to thread
            depth + 1,
            allComments  // Pass along the collection
          );
        }
      });
    }

    /**
     * Build a smart minimal conversation thread based on @mention tags
     * @param {Object} flaggedComment - The flagged comment data
     * @param {Array} parentThread - Full parent chain including original post
     * @param {Array} allComments - Collection of all processed comments (for sibling search)
     * @returns {Array} - Minimal conversation thread with only relevant context
     */
    function buildSmartConversationThread(flaggedComment, parentThread, allComments = []) {
      console.log('[Content] Building smart thread for flagged comment:', flaggedComment.id);
      console.log('[Content] Flagged comment tags:', JSON.stringify(flaggedComment.tags, null, 2));
      console.log('[Content] Parent thread length:', parentThread.length);
      console.log('[Content] All comments available for search:', allComments.length);

      // Always include original post (depth: -1)
      const originalPost = parentThread.find(msg => msg.depth === -1);
      if (!originalPost) {
        console.warn('[Content] No original post found in parent thread');
        return [flaggedComment];
      }

      // Analyze tags array for USER mentions at start of text
      const userTags = (flaggedComment.tags || []).filter(tag =>
        tag.type === 'USER' &&
        tag.startIndex !== undefined &&
        tag.startIndex < 20  // Mentioned at/near start
      );

      console.log('[Content] Found USER tags at start:', userTags.length);

      if (userTags.length > 0) {
        // Strategy 1: Find mentioned users' comments in ALL comments (including siblings)
        const mentionedUserIds = new Set(userTags.map(tag => tag.entityId));
        console.log('[Content] Mentioned user IDs:', Array.from(mentionedUserIds));

        const flaggedEpoch = parseInt(flaggedComment.createdAtEpoch) || Infinity;
        const mentionedComments = [];

        // Search ALL comments (not just parent chain) for mentioned users
        for (const comment of allComments) {
          if (mentionedUserIds.has(comment.authorUserId)) {
            const commentEpoch = parseInt(comment.createdAtEpoch) || 0;

            // Only include if posted before flagged comment
            if (commentEpoch <= flaggedEpoch) {
              mentionedComments.push(comment);
            }
          }
        }

        if (mentionedComments.length > 0) {
          console.log('[Content] Found mentioned users in all comments:', mentionedComments.length);

          // For each mentioned user, keep only their most recent comment
          const userToMostRecentComment = new Map();

          for (const comment of mentionedComments) {
            const existingComment = userToMostRecentComment.get(comment.authorUserId);
            if (!existingComment) {
              userToMostRecentComment.set(comment.authorUserId, comment);
            } else {
              const existingEpoch = parseInt(existingComment.createdAtEpoch) || 0;
              const currentEpoch = parseInt(comment.createdAtEpoch) || 0;
              if (currentEpoch > existingEpoch) {
                userToMostRecentComment.set(comment.authorUserId, comment);
              }
            }
          }

          const uniqueMentionedComments = Array.from(userToMostRecentComment.values());

          // Sort by timestamp (chronological order)
          uniqueMentionedComments.sort((a, b) => {
            const epochA = parseInt(a.createdAtEpoch) || 0;
            const epochB = parseInt(b.createdAtEpoch) || 0;
            return epochA - epochB;
          });

          // Filter out mentioned comments that are already in parent thread (avoid duplicates)
          const parentThreadIds = new Set(parentThread.map(c => c.id));
          const newMentionedComments = uniqueMentionedComments.filter(c => !parentThreadIds.has(c.id));

          // Build thread: [parent chain, new mentioned comments, flagged comment]
          const smartThread = [...parentThread, ...newMentionedComments, flaggedComment];

          console.log('[Content] Smart thread structure (Strategy 1 - with siblings):',
            smartThread.map(c => `${c.author} (depth ${c.depth})`).join(' → '));

          return smartThread;
        } else {
          console.log('[Content] No matching mentioned users found in all comments');
        }
      }

      // Strategy 2 (fallback): No USER tags or no matches - include direct parent only
      console.log('[Content] Using fallback strategy: direct parent only');

      // Find direct parent (comment at depth N-1 where N is flagged comment's depth)
      const directParent = parentThread
        .filter(msg => msg.depth !== -1)  // Exclude original post
        .slice(-1)[0];  // Get last comment in chain (immediate parent)

      if (directParent) {
        const smartThread = [originalPost, directParent, flaggedComment];
        console.log('[Content] Built fallback thread:', smartThread.length, 'messages');
        console.log('[Content] Thread structure:', smartThread.map(m => `${m.author} (depth: ${m.depth})`).join(' → '));
        return smartThread;
      }

      // Last resort: just original post + flagged comment
      console.log('[Content] Last resort: original post + flagged comment only');
      return [originalPost, flaggedComment];
    }

    // Start recursive search from top-level comments
    // Include the original post in the conversation thread
    const originalPostContext = {
      id: post.id,
      legacyId: feedItem.legacyAnalyticsId,
      content: originalPost.content,
      author: originalPost.author,
      authorUrl: originalPost.authorUrl,
      authorUserId: post.author?.user?.id || null,  // Store user ID for consistency
      createdAt: originalPost.createdAt,
      createdAtEpoch: post.createdAt?.epochMillis || null,  // Store timestamp
      depth: -1, // Mark as original post (before comments)
      isOriginalPost: true,
      tags: post.tags || [],  // Store tags array for consistency
    };

    // Initialize allComments collection with original post
    const allComments = [originalPostContext];

    const topLevelComments = post.comments?.pagedComments?.edges || [];
    findFlaggedCommentsRecursive(topLevelComments, [originalPostContext], 0, allComments);

    // Determine what is flagged
    const validation = {
      hasOriginalPost: !!originalPost.content || originalPost.hasMedia, // Accept posts with media even if no text
      hasTextContent: !!originalPost.content,
      hasMediaOnly: originalPost.hasMedia && !originalPost.content,
      hasVideos: originalPost.videoCount > 0,
      postIsFlagged: moderationInfo.hasModerationSummary,
      hasFlaggedComments: flaggedComments.length > 0,
      flaggedCount: (moderationInfo.hasModerationSummary ? 1 : 0) + flaggedComments.length,
      multipleFlags: (moderationInfo.hasModerationSummary ? 1 : 0) + flaggedComments.length > 1,
    };

    // Determine flagged content (prioritize post, then first comment)
    let flaggedContent = null;
    if (validation.postIsFlagged) {
      flaggedContent = {
        type: 'post',
        ...originalPost,
        moderationSummary: moderationInfo.moderationSummary,
        moderationDetails: moderationDetails,
      };
    } else if (flaggedComments.length > 0) {
      flaggedContent = {
        type: 'comment',
        ...flaggedComments[0],
      };
    }

    return {
      success: true,
      data: {
        url: window.location.href,
        originalPost,
        flaggedContent,
        flaggedComments,
        moderationInfo,
        validation,
        rawFeedItem: feedItem,
        extractedAt: new Date().toISOString(),
      },
    };

  } catch (error) {
    console.error('[Nextdoor Moderator] Error extracting data:', error);
    return {
      success: false,
      error: `Error parsing API data: ${error.message}`,
    };
  }
}

/**
 * Format AI analysis text with markdown-style formatting
 */
function formatAIAnalysis(text) {
  if (!text) return 'No analysis available';

  // Replace **bold** with <strong>
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Parse markdown tables
  text = text.replace(/((?:^\|.+\|\s*\n)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return tableBlock;

    // Check if second row is a separator (|---|---|)
    const isSeparator = (row) => /^\|[\s\-:|]+\|$/.test(row.trim());
    const hasSeparator = rows.length >= 2 && isSeparator(rows[1]);

    let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:13px;">';

    rows.forEach((row, idx) => {
      if (hasSeparator && idx === 1) return; // skip separator row
      const cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim());
      const isHeader = hasSeparator && idx === 0;
      const tag = isHeader ? 'th' : 'td';
      const bgStyle = isHeader ? 'background:#f0f0f0; font-weight:600;' : (idx % 2 === 0 ? 'background:#fafafa;' : '');
      tableHtml += '<tr>';
      cells.forEach(cell => {
        tableHtml += `<${tag} style="border:1px solid #ddd; padding:6px 8px; text-align:left; ${bgStyle}">${cell}</${tag}>`;
      });
      tableHtml += '</tr>';
    });

    tableHtml += '</table>';
    return tableHtml;
  });

  // Replace --- horizontal rules
  text = text.replace(/^---$/gm, '<hr style="border:none; border-top:1px solid #ddd; margin:12px 0;">');

  // Split into sections and format
  let html = '';
  const lines = text.split('\n');

  lines.forEach(line => {
    line = line.trim();
    if (!line) {
      html += '<br>';
      return;
    }

    // Skip if it's already an HTML element (from table parsing)
    if (line.startsWith('<table') || line.startsWith('<hr')) {
      html += line;
      return;
    }

    // Check if it's a bullet point
    if (line.startsWith('- ') || line.startsWith('* ')) {
      html += `<div style="margin-left: 20px; margin-bottom: 4px;">&bull; ${line.substring(2)}</div>`;
    }
    // Check if it's a copyable field (Comment Suggestion or Optional Note)
    else if (line.match(/^<strong>(Comment Suggestion|Optional Note):<\/strong>/)) {
      const copyValue = line.replace(/<\/?strong>/g, '').replace(/^(Comment Suggestion|Optional Note):\s*/, '').trim();
      const btnId = `copy-btn-${Math.random().toString(36).substring(2, 8)}`;
      html += `<div style="margin-top: 12px; margin-bottom: 4px; font-size: 15px; display: flex; align-items: baseline; gap: 8px;">
        <span>${line}</span>
        <button id="${btnId}" data-copy-text="${copyValue.replace(/"/g, '&quot;')}" style="background: none; border: 1px solid #ccc; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 12px; color: #666; white-space: nowrap; flex-shrink: 0;" title="Copy to clipboard">Copy</button>
      </div>`;
    }
    // Check if it's a section header (contains strong tag at start)
    else if (line.match(/^<strong>[^<]+:<\/strong>/)) {
      html += `<div style="margin-top: 12px; margin-bottom: 4px; font-size: 15px;">${line}</div>`;
    }
    // Regular paragraph
    else {
      html += `<div style="margin-bottom: 4px;">${line}</div>`;
    }
  });

  return html;
}

/**
 * Format conversation thread for display in overlay
 */
function formatConversationThread(conversationThread) {
  if (!conversationThread || conversationThread.length === 0) {
    return '';
  }

  // Limit display to max 5 levels deep to avoid overwhelming UI
  const maxDisplay = 5;
  const displayThread = conversationThread.slice(-maxDisplay);
  const truncated = conversationThread.length > maxDisplay;

  let html = '<div style="margin-bottom: 16px;">';
  html += '<h4 style="margin: 0 0 8px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 8px;">Conversation Thread</h4>';

  if (truncated) {
    html += '<div style="font-size: 11px; color: #999; margin-bottom: 8px; font-style: italic;">Showing last 5 of ' + conversationThread.length + ' messages</div>';
  }

  displayThread.forEach((msg, idx) => {
    // Calculate indent: Original post (depth -1) = 0px, depth 0 = 20px, depth 1 = 40px, etc.
    const indent = Math.max(0, (msg.depth + 1) * 20);
    // Depth indicator: Original post gets none, depth 0 gets →, depth 1 gets →→, etc.
    const depthIndicator = msg.depth >= 0 ? '→ '.repeat(Math.min(msg.depth + 1, 3)) : '';

    html += `<div style="margin-bottom: 6px; margin-left: ${indent}px; padding: 8px; background: #f9f9f9; border-left: 3px solid #2196F3; border-radius: 3px;">
      <div style="font-size: 11px; color: #666; margin-bottom: 3px;">
        ${depthIndicator}<strong>${msg.author}</strong> <span style="color: #999;">${msg.createdAt}</span>
      </div>
      <div style="font-size: 12px; color: #333; line-height: 1.4;">
        "${msg.content.length > 150 ? msg.content.substring(0, 150) + '...' : msg.content}"
      </div>
    </div>`;
  });

  html += '</div>';
  return html;
}

/**
 * Format moderation details for display in overlay
 */
function formatModerationDetails(moderationDetails) {
  if (!moderationDetails) {
    return '<div style="background: #f5f5f5; padding: 12px; border-radius: 4px; margin-top: 12px; font-size: 12px; color: #666;">No detailed moderation data available</div>';
  }

  let html = '<div style="margin-top: 12px; border-top: 1px solid #ddd; padding-top: 12px;">';

  // Reports section
  if (moderationDetails.totalReports > 0 || moderationDetails.reports.length > 0) {
    console.log('[DEBUG REPORTS] Total reports:', moderationDetails.totalReports);
    console.log('[DEBUG REPORTS] Reports array:', JSON.stringify(moderationDetails.reports, null, 2));

    // Calculate vote totals from actual reviewer data
    let keepCount = 0;
    let maybeRemoveCount = 0;
    let removeCount = 0;

    moderationDetails.reports.forEach((report) => {
      if (report.type === 'individual_report') {
        if (report.voteType === 'keep') keepCount++;
        else if (report.voteType === 'abstain') maybeRemoveCount++;
        else if (report.voteType === 'remove') removeCount++;
      }
    });

    html += `
      <div style="background: #ffebee; padding: 12px; border-radius: 4px; margin-bottom: 8px;">
        <div style="font-weight: bold; color: #c62828; margin-bottom: 8px; font-size: 14px;">
          📊 Reports Summary (${moderationDetails.totalReports} total)
        </div>
        <div style="font-size: 12px; color: #333;">
    `;

    // Display vote totals at the top (calculated from actual reviewers)
    const totalVotes = keepCount + maybeRemoveCount + removeCount;
    if (totalVotes > 0) {
      html += `
        <div style="font-weight: bold; margin-bottom: 4px;">Vote totals</div>
        <div style="display: flex; gap: 16px; align-items: center; padding: 12px 0; margin-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #4CAF50; font-size: 20px; font-weight: bold;">✓</span>
            <span style="font-weight: bold; color: #4CAF50;">Keep: ${keepCount}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #9E9E9E; font-size: 20px; font-weight: bold;">−</span>
            <span style="font-weight: bold; color: #9E9E9E;">Maybe remove: ${maybeRemoveCount}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #F44336; font-size: 20px; font-weight: bold;">✗</span>
            <span style="font-weight: bold; color: #F44336;">Remove: ${removeCount}</span>
          </div>
        </div>
      `;
    }

    moderationDetails.reports.forEach((report) => {
      console.log('[DEBUG REPORTS] Processing report:', report.type, 'reason:', report.reason, 'count:', report.count);
      if (report.type === 'title') {
        // Skip "Vote totals" title since we're displaying it above
        if (report.text !== 'Vote totals') {
          html += `<div style="font-weight: bold; margin-bottom: 4px;">${report.text}</div>`;
        }
      } else if (report.type === 'description') {
        html += `<div style="margin-bottom: 4px; color: #666;">${report.text}</div>`;
      } else if (report.type === 'section') {
        // Skip vote totals section - we're calculating it from actual reviewer data
        const sectionText = report.text || '';
        const bulletPattern = /\*\s*(\d+)/g;
        const matches = [...sectionText.matchAll(bulletPattern)];

        // If this looks like vote totals (has asterisk + numbers), skip it
        if (matches.length >= 1 && matches.length <= 3) {
          // Skip - we're displaying calculated vote totals above
        } else {
          // Regular section text
          html += `<div style="margin-top: 8px; margin-bottom: 4px; font-weight: 600; color: #d32f2f;">${report.text}</div>`;
        }
      } else if (report.type === 'row') {
        // Skip vote totals rows - we're calculating from actual reviewer data
        const reasonText = report.reason || '';
        const countText = report.count || '';
        const combinedText = reasonText + ' ' + countText;
        const bulletPattern = /\*\s*(\d+)/g;
        const matches = [...combinedText.matchAll(bulletPattern)];

        // If this looks like vote totals, skip it
        if (matches.length >= 1 && matches.length <= 3) {
          // Skip - we're displaying calculated vote totals above
        } else {
          // Regular report row - display as-is
          html += `<div style="display: flex; justify-content: space-between; margin-bottom: 2px; padding: 4px; background: rgba(255,255,255,0.5); border-radius: 2px;">
            <span>${report.reason}</span>
            <span style="font-weight: bold; color: #c62828;">${report.count}</span>
          </div>`;
        }
      } else if (report.type === 'individual_report') {
        // Determine icon and color based on voteType
        let voteIcon = '';
        let voteColor = '';
        let voteLabel = '';

        if (report.voteType === 'keep') {
          voteIcon = '✓';
          voteColor = '#4CAF50'; // Green
          voteLabel = 'Keep';
        } else if (report.voteType === 'remove') {
          voteIcon = '✗';
          voteColor = '#F44336'; // Red
          voteLabel = 'Remove';
        } else if (report.voteType === 'abstain') {
          voteIcon = '−';
          voteColor = '#9E9E9E'; // Grey
          voteLabel = 'Maybe remove';
        } else if (report.voteType === 'report') {
          voteIcon = '🚩';
          voteColor = '#FF9800'; // Orange for reports
          voteLabel = 'Report';
        } else {
          voteIcon = '−';
          voteColor = '#9E9E9E'; // Grey
          voteLabel = 'Maybe remove';
        }

        html += `
          <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f9f9f9; border-radius: 4px; margin: 4px 0;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: ${voteColor}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; flex-shrink: 0;">
              ${voteIcon}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: bold; font-size: 13px; color: #333;">${report.reporterName}</div>
              <div style="font-size: 11px; color: #666;">${report.locationTime}</div>
              ${report.reportType ? `<div style="font-size: 12px; color: #d32f2f; margin-top: 2px;">→ ${report.reportType}</div>` : ''}
              ${report.additionalNote ? `<div style="font-size: 12px; color: #555; margin-top: 4px; font-style: italic; background: #fff; padding: 4px 8px; border-radius: 3px; border-left: 2px solid ${voteColor};">"${report.additionalNote}"</div>` : ''}
            </div>
            <div style="color: ${voteColor}; font-weight: bold; font-size: 14px; flex-shrink: 0;">
              ${voteLabel}
            </div>
          </div>
        `;
      }
    });

    html += `</div></div>`;
  }

  // Votes section
  if (moderationDetails.totalVotes > 0 || moderationDetails.votes.length > 0) {
    html += `
      <div style="background: #e3f2fd; padding: 12px; border-radius: 4px; margin-bottom: 8px;">
        <div style="font-weight: bold; color: #1976d2; margin-bottom: 8px; font-size: 14px;">
          👍 Community Votes (${moderationDetails.totalVotes} total)
        </div>
        <div style="font-size: 12px; color: #333;">
    `;

    // Process vote rows first (these may contain vote totals)
    const voteRows = moderationDetails.votes.filter(v => v.type === 'row');
    const individualVotes = moderationDetails.votes.filter(v => v.type === 'individual_vote');

    console.log('[DEBUG RENDER] voteRows:', JSON.stringify(voteRows, null, 2));
    console.log('[DEBUG RENDER] individualVotes:', individualVotes.length);

    // Check if we have vote totals to display
    if (voteRows.length > 0) {
      // Try to parse vote totals from the text
      // Look for patterns like "* 8   * 5" or vote type labels
      let keepCount = 0;
      let abstainCount = 0;
      let removeCount = 0;
      let hasVoteTotals = false;

      voteRows.forEach((vote) => {
        const text = vote.reason || '';
        console.log('[DEBUG RENDER] Processing vote row - reason:', vote.reason, 'count:', vote.count, 'isVoteTotals:', vote.isVoteTotals);

        // Check if this row is marked as part of vote totals section
        if (vote.isVoteTotals) {
          hasVoteTotals = true;
          // Parse the vote type and count
          const count = parseInt(vote.count) || 0;
          if (text.includes('Keep') || text.includes('keep')) {
            keepCount = count;
          } else if (text.includes('Remove') || text.includes('remove')) {
            removeCount = count;
          } else if (text.includes('Abstain') || text.includes('abstain') || text.includes('Maybe')) {
            abstainCount = count;
          }
        }
      });

      // If we couldn't parse structured data, try to extract from bullet points
      if (!hasVoteTotals) {
        voteRows.forEach((vote) => {
          const reasonText = vote.reason || '';
          const countText = vote.count || '';

          // Try to parse patterns like "* 6 * 2 * 8" in BOTH count and reason fields
          const bulletPattern = /\*\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/;
          const bulletMatchCount = countText.match(bulletPattern);
          const bulletMatchReason = reasonText.match(bulletPattern);

          const bulletMatch = bulletMatchCount || bulletMatchReason;

          if (bulletMatch) {
            console.log('[DEBUG RENDER] Matched bullet pattern:', bulletMatch[0]);
            console.log('[DEBUG RENDER] Extracted values - Keep:', bulletMatch[1], 'Abstain:', bulletMatch[2], 'Remove:', bulletMatch[3]);
            // Assuming order: Keep, Abstain, Remove (based on Nextdoor's typical order)
            keepCount = parseInt(bulletMatch[1]) || 0;
            abstainCount = parseInt(bulletMatch[2]) || 0;
            removeCount = parseInt(bulletMatch[3]) || 0;
            hasVoteTotals = true;
          }
        });
      }

      // Display vote totals section title if it exists
      const voteTotalsSection = moderationDetails.votes.find(v => v.type === 'section');
      if (voteTotalsSection) {
        html += `<div style="font-weight: 600; color: #1976d2; margin-bottom: 8px; font-size: 13px;">${voteTotalsSection.text}</div>`;
      }

      // Display vote totals with color-coded icons
      if (hasVoteTotals || keepCount > 0 || abstainCount > 0 || removeCount > 0) {
        html += `
          <div style="display: flex; gap: 16px; align-items: center; padding: 8px 0; margin-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: #4CAF50; font-size: 20px; font-weight: bold;">✓</span>
              <span style="font-weight: bold; color: #4CAF50;">Keep: ${keepCount}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: #9E9E9E; font-size: 20px; font-weight: bold;">−</span>
              <span style="font-weight: bold; color: #9E9E9E;">Abstain: ${abstainCount}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: #F44336; font-size: 20px; font-weight: bold;">✗</span>
              <span style="font-weight: bold; color: #F44336;">Remove: ${removeCount}</span>
            </div>
          </div>
        `;
      }
    }

    // Display individual votes with prominent circular icons
    individualVotes.forEach((vote) => {
      let voteIcon = '';
      let voteColor = '';
      let voteLabel = '';

      if (vote.voteType === 'keep') {
        voteIcon = '✓';
        voteColor = '#4CAF50'; // Green
        voteLabel = 'Keep';
      } else if (vote.voteType === 'remove') {
        voteIcon = '✗';
        voteColor = '#F44336'; // Red
        voteLabel = 'Remove';
      } else {
        voteIcon = '−';
        voteColor = '#9E9E9E'; // Grey
        voteLabel = 'Abstain';
      }

      html += `
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f9f9f9; border-radius: 4px; margin: 4px 0;">
          <div style="width: 24px; height: 24px; border-radius: 50%; background: ${voteColor}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; flex-shrink: 0;">
            ${voteIcon}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: bold; font-size: 13px; color: #333;">${vote.voterName}</div>
            <div style="font-size: 11px; color: #666;">${vote.locationTime}</div>
            ${vote.additionalNote ? `<div style="font-size: 12px; color: #555; margin-top: 4px; font-style: italic; background: #fff; padding: 4px 8px; border-radius: 3px; border-left: 2px solid ${voteColor};">"${vote.additionalNote}"</div>` : ''}
          </div>
          <div style="color: ${voteColor}; font-weight: bold; font-size: 14px; flex-shrink: 0;">
            ${voteLabel}
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  }

  // Notes section
  if (moderationDetails.totalNotes > 0) {
    html += `
      <div style="background: #fff3e0; padding: 12px; border-radius: 4px; margin-bottom: 8px;">
        <div style="font-weight: bold; color: #f57c00; margin-bottom: 8px; font-size: 14px;">
          📝 Moderator Notes (${moderationDetails.totalNotes} total)
        </div>
        <div style="font-size: 12px; color: #333;">
    `;

    moderationDetails.notes.forEach((note, idx) => {
      html += `<div style="margin-bottom: 4px; padding: 4px; background: rgba(255,255,255,0.5); border-radius: 2px;">
        ${idx + 1}. ${note.text}
      </div>`;
    });

    html += `</div></div>`;
  }

  // Collapsed view fallback
  if (moderationDetails.collapsedLeftText || moderationDetails.collapsedRightText) {
    html += `
      <div style="background: #f5f5f5; padding: 12px; border-radius: 4px; font-size: 12px; color: #666;">
        ${moderationDetails.collapsedLeftText ? `<div><strong>Summary:</strong> ${moderationDetails.collapsedLeftText}</div>` : ''}
        ${moderationDetails.collapsedRightText ? `<div><strong>Count:</strong> ${moderationDetails.collapsedRightText}</div>` : ''}
      </div>
    `;
  }

  html += '</div>';
  return html;
}

/**
 * Create Phase 1: Content Display Overlay
 */
async function createContentOverlay(result) {
  if (!result.success) {
    showErrorOverlay(result.error);
    return;
  }

  const { data } = result;
  const { originalPost, flaggedContent, validation } = data;
  const postId = flaggedContent?.id || flaggedContent?.legacyId || originalPost.id || originalPost.legacyId;

  // Load any saved review data for this post
  const savedReview = await loadPostReview(postId);

  // Remove any existing overlays
  const existingBackdrop = document.getElementById('nextdoor-moderator-backdrop');
  const existingOverlay = document.getElementById('nextdoor-moderator-overlay');
  existingBackdrop?.remove();
  existingOverlay?.remove();

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'nextdoor-moderator-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    backdrop-filter: blur(2px);
  `;

  // Create overlay content
  const overlay = document.createElement('div');
  overlay.id = 'nextdoor-moderator-overlay';
  overlay.dataset.postId = postId || '';
  overlay.dataset.reviewData = JSON.stringify(data);

  // Load saved size or use defaults
  const savedSize = await browser.storage.local.get('overlaySize');
  const overlayW = savedSize.overlaySize?.width || 600;
  const overlayH = savedSize.overlaySize?.height || null;

  // Outer shell: fixed position, holds resize handle
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: ${overlayW}px;
    ${overlayH ? `height: ${overlayH}px;` : 'max-height: 80vh;'}
    background: white;
    border: 2px solid #4CAF50;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
  `;

  // Inner scrollable content wrapper
  const scrollWrapper = document.createElement('div');
  scrollWrapper.id = 'nextdoor-moderator-scroll';
  scrollWrapper.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    min-height: 0;
  `;

  // Resize handle - stays visible at bottom-right corner
  const resizeHandle = document.createElement('div');
  resizeHandle.style.cssText = `
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
    z-index: 10001;
    background: linear-gradient(135deg, transparent 50%, #999 50%, transparent 55%, #999 60%, transparent 65%, #999 70%);
    opacity: 0.5;
    border-radius: 0 0 6px 0;
  `;
  resizeHandle.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
  resizeHandle.addEventListener('mouseleave', () => { resizeHandle.style.opacity = '0.5'; });
  overlay.appendChild(resizeHandle);

  let resizing = false, rStartX, rStartY, rStartW, rStartH;
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    resizing = true;
    rStartX = e.clientX;
    rStartY = e.clientY;
    rStartW = overlay.offsetWidth;
    rStartH = overlay.offsetHeight;
    overlay.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = e.clientX - rStartX;
    const dy = e.clientY - rStartY;
    const newW = Math.max(400, Math.min(1200, rStartW + dx * 2));
    const newH = Math.max(300, rStartH + dy * 2);
    overlay.style.width = newW + 'px';
    overlay.style.height = newH + 'px';
    overlay.style.maxHeight = 'none';
  });
  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    overlay.style.userSelect = '';
    browser.storage.local.set({
      overlaySize: { width: overlay.offsetWidth, height: overlay.offsetHeight }
    });
  });

  let contentHTML = '';

  // Validation: Handle media-only posts
  if (validation.hasMediaOnly) {
    contentHTML += `
      <div style="background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; padding: 12px; color: #e65100; margin-bottom: 12px;">
        <strong>⚠️ Media-Only Post:</strong> This post contains ${originalPost.mediaCount} ${originalPost.mediaTypes.toLowerCase()} but no text.
        <br><br>
        <strong>⚠️ Required:</strong> You MUST describe the media content in the "Additional Context" field below before analyzing.
      </div>
    `;
  } else if (!validation.hasOriginalPost) {
    contentHTML += `
      <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828; margin-bottom: 12px;">
        <strong>Error:</strong> Could not find original post content or media
      </div>
    `;
  }

  if (!validation.postIsFlagged && !validation.hasFlaggedComments) {
    contentHTML += `
      <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828; margin-bottom: 12px;">
        <strong>Error:</strong> No flagged content found
      </div>
    `;
  }

  // Success case
  if (validation.hasOriginalPost && (validation.postIsFlagged || validation.hasFlaggedComments)) {
    const multipleWarning = validation.multipleFlags ? `
      <div style="background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; padding: 12px; color: #e65100; margin-bottom: 12px;">
        <strong>⚠️ Warning:</strong> Multiple items flagged. Analyzing first one only.
      </div>
    ` : '';

    contentHTML = `
      ${multipleWarning}

      <div style="margin-bottom: 16px;">
        <h4 style="margin: 0 0 8px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 8px;">Original Post</h4>
        <div style="margin-bottom: 8px;">
          <strong>Author:</strong> ${originalPost.author}
        </div>
        <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
          <strong>Posted:</strong> ${originalPost.createdAt} • <strong>Location:</strong> ${originalPost.neighborhood}
        </div>
        <div style="background: #f5f5f5; padding: 12px; border-radius: 4px; line-height: 1.6; color: #333;">
          ${originalPost.content}
        </div>
      </div>

      ${flaggedContent.conversationThread && flaggedContent.conversationThread.length > 0 ? formatConversationThread(flaggedContent.conversationThread) : ''}

      <div style="margin-bottom: 16px;">
        <h4 style="margin: 0 0 8px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 8px;">Flagged Content</h4>
        ${flaggedContent.type === 'post' ? `
          <div style="background: #ffebee; padding: 12px; border-radius: 4px; color: #c62828; margin-bottom: 8px;">
            <strong>⚠️ Original post is flagged</strong>
          </div>
        ` : `
          <div style="margin-bottom: 8px;">
            <strong>Author:</strong> ${flaggedContent.author}
          </div>
          <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
            <strong>Posted:</strong> ${flaggedContent.createdAt}
            ${flaggedContent.depth !== undefined ? ` • <strong>Depth:</strong> ${flaggedContent.depth}` : ''}
          </div>
          <div style="background: #fff3e0; padding: 12px; border-radius: 4px; line-height: 1.6; color: #333; border-left: 4px solid #ff9800;">
            ${flaggedContent.content}
          </div>
        `}
        ${formatModerationDetails(flaggedContent.moderationDetails)}
      </div>
    `;
  }

  scrollWrapper.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; color: #333;">Content Review (API Data)</h3>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="copy-all-btn" style="background: none; border: 1px solid #bbb; border-radius: 4px; padding: 3px 10px; font-size: 12px; color: #555; cursor: pointer;" title="Copy post tree + AI decision to clipboard">Copy All</button>
        <button id="close-overlay" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
      </div>
    </div>
    ${contentHTML}
    <div style="margin-top: 16px; border-top: 2px solid #ddd; padding-top: 16px;">
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label for="additional-context" style="font-weight: bold; font-size: 13px; color: #555;">
            Additional Context ${(validation.hasMediaOnly || validation.hasVideos) ? '<span style="color: #f44336;">*</span>' : '(optional)'}
          </label>
          <button id="clear-context-btn" style="background: none; border: 1px solid #ccc; border-radius: 4px; padding: 2px 8px; font-size: 11px; color: #999; cursor: pointer; display: ${savedReview?.additionalContext ? 'inline-block' : 'none'};" title="Clear saved context">Clear</button>
        </div>
        <textarea
          id="additional-context"
          placeholder="${validation.hasVideos ? 'REQUIRED: Describe the video content shown in this post...' : validation.hasMediaOnly ? 'REQUIRED: Describe the image/video/media content shown in this post...' : 'Describe images, videos, links, or other context not visible in the text (e.g., \'Post includes image of political yard sign\' or \'Video shows heated argument\')'}"
          style="
            width: 100%;
            min-height: 60px;
            max-height: 200px;
            padding: 8px;
            border: 2px solid ${(validation.hasMediaOnly || validation.hasVideos) ? '#f44336' : '#ccc'};
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 13px;
            resize: vertical;
            box-sizing: border-box;
            ${(validation.hasMediaOnly || validation.hasVideos) ? 'background: #fff9c4;' : ''}
          "
        ></textarea>
        ${validation.hasVideos ? `
          <div style="font-size: 12px; color: #f44336; margin-top: 4px;">
            <strong>⚠️ This field is REQUIRED</strong> — this post contains video that cannot be sent to the AI. Please describe what the video shows.
          </div>
        ` : validation.hasMediaOnly ? `
          <div style="font-size: 12px; color: #f44336; margin-top: 4px;">
            <strong>⚠️ This field is REQUIRED</strong> because the post has no text content.
          </div>
        ` : `
          <div style="font-size: 11px; color: #666; margin-top: 4px;">
            This context will be included in the LLM analysis to provide additional information about media or context not visible in the text.
          </div>
        `}
      </div>
      <button id="analyze-btn" style="
        width: 100%;
        padding: 12px;
        background: #2196F3;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 15px;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
      " onmouseover="this.style.background='#1976D2'" onmouseout="this.style.background='#2196F3'">
        🤖 Analyze with AI
      </button>
      <div id="ai-analysis-container" style="margin-top: 16px;"></div>
    </div>
  `;

  // Add build info footer (load asynchronously after overlay is in DOM)
  const addBuildInfoFooter = async () => {
    try {
      const buildInfoUrl = browser.runtime.getURL('build-info.json');
      const response = await fetch(buildInfoUrl);
      const buildInfo = await response.json();

      const footer = document.createElement('div');
      footer.style.cssText = 'text-align: center; padding: 8px; color: #999; font-size: 11px; border-top: 1px solid #ddd; margin-top: 16px;';

      let footerText = `Version ${buildInfo.version}`;

      if (buildInfo.buildTime) {
        const buildDate = new Date(buildInfo.buildTime);
        const formattedDate = buildDate.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        footerText += ` • Built: ${formattedDate}`;
      }

      footer.textContent = footerText;
      scrollWrapper.appendChild(footer);
    } catch (error) {
      console.error('Error loading build info:', error);
      // Fallback: show version only from manifest
      const manifest = browser.runtime.getManifest();
      const footer = document.createElement('div');
      footer.style.cssText = 'text-align: center; padding: 8px; color: #999; font-size: 11px; border-top: 1px solid #ddd; margin-top: 16px;';
      footer.textContent = `Version ${manifest.version}`;
      scrollWrapper.appendChild(footer);
    }
  };

  // Add scrollWrapper into overlay, then add to DOM
  overlay.insertBefore(scrollWrapper, resizeHandle);
  document.body.appendChild(backdrop);
  document.body.appendChild(overlay);

  // Restore saved additional context
  const additionalContextTextarea = overlay.querySelector('#additional-context');
  if (savedReview?.additionalContext && additionalContextTextarea) {
    additionalContextTextarea.value = savedReview.additionalContext;
  }

  // Restore saved AI analysis with cache banner
  const analysisContainer = overlay.querySelector('#ai-analysis-container');
  if (savedReview?.analysisHtml && analysisContainer) {
    analysisContainer.innerHTML = `
      <div id="cache-banner" style="background: #e3f2fd; border: 1px solid #90caf9; border-radius: 4px; padding: 8px 12px; margin-bottom: 8px; font-size: 12px; color: #1565c0; display: flex; justify-content: space-between; align-items: center;">
        <span>Previously generated analysis (restored from cache)</span>
        <button id="dismiss-cache-banner" style="background: none; border: none; cursor: pointer; color: #1565c0; font-size: 14px;">&times;</button>
      </div>
    ` + savedReview.analysisHtml;
    // Dismiss banner handler
    analysisContainer.querySelector('#dismiss-cache-banner')?.addEventListener('click', () => {
      analysisContainer.querySelector('#cache-banner')?.remove();
    });
    // Re-attach copy button handlers
    analysisContainer.querySelectorAll('[data-copy-text]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copyText).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
      });
    });
    // Scroll cached analysis into view after overlay is added to DOM
    requestAnimationFrame(() => analysisContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  // Save function — captures current state
  const saveCurrentState = async () => {
    const ctx = additionalContextTextarea?.value.trim() || '';
    const analysisEl = overlay.querySelector('#ai-analysis-container');
    const html = analysisEl?.innerHTML || '';
    if (ctx || html) {
      await savePostReview(postId, { additionalContext: ctx, analysisHtml: html });
    }
  };

  // Remove function for cleanup (saves before closing)
  const removeOverlay = async () => {
    await saveCurrentState();
    backdrop.remove();
    overlay.remove();
  };

  // Close button handler
  const closeBtn = overlay.querySelector('#close-overlay');
  closeBtn?.addEventListener('click', removeOverlay);

  // Click outside to close (click on backdrop)
  backdrop.addEventListener('click', removeOverlay);

  // Clear context button
  const clearBtn = overlay.querySelector('#clear-context-btn');
  clearBtn?.addEventListener('click', async () => {
    if (additionalContextTextarea) additionalContextTextarea.value = '';
    clearBtn.style.display = 'none';
    await clearPostReview(postId);
  });

  // Copy All button handler
  const copyAllBtn = overlay.querySelector('#copy-all-btn');
  copyAllBtn?.addEventListener('click', () => {
    const reviewData = JSON.parse(overlay.dataset.reviewData || '{}');
    const { originalPost, flaggedContent } = reviewData;
    const lines = [];

    lines.push('=== ORIGINAL POST ===');
    lines.push(`Author: ${originalPost?.author || 'Unknown'}`);
    if (originalPost?.createdAt) lines.push(`Posted: ${originalPost.createdAt}`);
    lines.push(originalPost?.content || '(no text)');
    if (originalPost?.imageUrls?.length > 0) {
      originalPost.imageUrls.forEach(url => lines.push(`[Image: ${url}]`));
    }

    const thread = flaggedContent?.conversationThread;
    if (thread && thread.length > 0) {
      lines.push('');
      lines.push('=== CONVERSATION THREAD ===');
      thread.forEach(c => {
        const indent = '  '.repeat(c.depth || 0);
        lines.push(`${indent}[${c.author}]: ${c.content}`);
      });
    }

    lines.push('');
    lines.push('=== FLAGGED CONTENT ===');
    if (flaggedContent?.type === 'post') {
      lines.push('(Original post is flagged)');
    } else {
      lines.push(`Author: ${flaggedContent?.author || 'Unknown'}`);
      if (flaggedContent?.createdAt) lines.push(`Posted: ${flaggedContent.createdAt}`);
      lines.push(flaggedContent?.content || '(no text)');
    }
    const mod = flaggedContent?.moderationDetails;
    if (mod?.tags?.length) lines.push(`Tags: ${mod.tags.map(t => `${t.reason} (${t.reporter})`).join(', ')}`);
    if (mod?.votes) {
      const v = mod.votes;
      lines.push(`Votes: Keep ${v.keep || 0} / Remove ${v.remove || 0} / Maybe Remove ${v.abstain || 0} / Report ${v.report || 0}`);
    }
    if (mod?.reviewerNotes?.length) {
      lines.push('Reporter notes:');
      mod.reviewerNotes.forEach(n => lines.push(`  - ${n}`));
    }

    const ctx = overlay.querySelector('#additional-context')?.value?.trim();
    if (ctx) {
      lines.push('');
      lines.push('=== ADDITIONAL CONTEXT ===');
      lines.push(ctx);
    }

    const analysisText = overlay.querySelector('#ai-analysis-container')?.innerText?.trim();
    if (analysisText) {
      lines.push('');
      lines.push('=== AI ANALYSIS ===');
      lines.push(analysisText);
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      copyAllBtn.textContent = 'Copied!';
      setTimeout(() => { copyAllBtn.textContent = 'Copy All'; }, 1500);
    });
  });

  // Show clear button when context is typed
  additionalContextTextarea?.addEventListener('input', () => {
    const clearBtnEl = overlay.querySelector('#clear-context-btn');
    if (clearBtnEl) {
      clearBtnEl.style.display = additionalContextTextarea.value.trim() ? 'inline-block' : 'none';
    }
  });

  // Prevent clicks inside overlay from closing it
  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Analyze button handler
  const analyzeBtn = overlay.querySelector('#analyze-btn');
  analyzeBtn?.addEventListener('click', () => {
    const analysisContainer = overlay.querySelector('#ai-analysis-container');
    const additionalContextTextarea = overlay.querySelector('#additional-context');
    if (!analysisContainer) return;

    // Get additional context from textarea
    const additionalContext = additionalContextTextarea?.value.trim() || '';

    // Validate: For media-only or video posts, additional context is REQUIRED
    if ((validation.hasMediaOnly || validation.hasVideos) && !additionalContext) {
      const msg = validation.hasVideos
        ? 'Additional Context is required for posts with video. Please describe what the video shows.'
        : 'Additional Context is required for media-only posts. Please describe the content of the image/video/media.';
      analysisContainer.innerHTML = `
        <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828;">
          <strong>Error:</strong> ${msg}
        </div>
      `;
      additionalContextTextarea.style.border = '2px solid #f44336';
      additionalContextTextarea.focus();
      return;
    }

    // Clear existing analysis
    analysisContainer.innerHTML = '';

    // Show loading state
    analyzeBtn.disabled = true;
    analyzeBtn.style.cursor = 'not-allowed';
    analyzeBtn.style.opacity = '0.6';
    analyzeBtn.innerHTML = `
      <span style="display: inline-block; margin-right: 8px;">Analyzing...</span>
      <span style="display: inline-block; animation: spin 1s linear infinite;">⟳</span>
    `;

    // Add spinner animation if not exists
    if (!document.getElementById('spinner-style')) {
      const style = document.createElement('style');
      style.id = 'spinner-style';
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // Send to background script with additional context and image URLs
    browser.runtime.sendMessage({
      action: 'analyzeContent',
      data: {
        originalPost: data.originalPost,
        flaggedContent: data.flaggedContent,
        conversationThread: data.flaggedContent?.conversationThread || [],
        additionalContext: additionalContext,
        imageUrls: data.originalPost?.imageUrls || [],
      },
    }).then((response) => {
      console.log('[Content] Analysis request response:', response);
      if (response && typeof response === 'object' && !response.success) {
        console.error('[Content] Analysis request failed:', response.error);
        analysisContainer.innerHTML = `
          <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828;">
            ${response.error || 'Analysis failed'}
          </div>
        `;
        // Re-enable button
        analyzeBtn.disabled = false;
        analyzeBtn.style.cursor = 'pointer';
        analyzeBtn.style.opacity = '1';
        analyzeBtn.innerHTML = '🤖 Analyze with AI';
      } else {
        console.log('[Content] Analysis request sent, waiting for result...');
      }
    }).catch((error) => {
      console.error('[Content] Error sending analysis request:', error);
      analysisContainer.innerHTML = `
        <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828;">
          ${error.message}
        </div>
      `;
      // Re-enable button
      analyzeBtn.disabled = false;
      analyzeBtn.style.cursor = 'pointer';
      analyzeBtn.style.opacity = '1';
      analyzeBtn.innerHTML = '🤖 Analyze with AI';
    });
  });

  // Add build info footer after event listeners are attached
  addBuildInfoFooter();
}

/**
 * Send data to background for AI analysis
 */
function sendToAI(overlayElement, data) {
  const sendBtn = overlayElement.querySelector('#send-to-ai');
  const closeBtn = overlayElement.querySelector('#close-overlay');

  // Disable button and show loading state
  sendBtn.disabled = true;
  sendBtn.style.cursor = 'not-allowed';
  sendBtn.style.opacity = '0.6';
  sendBtn.innerHTML = `
    <span style="display: inline-block; margin-right: 8px;">Analyzing...</span>
    <span style="display: inline-block; animation: spin 1s linear infinite;">⟳</span>
  `;

  // Add spinner animation if not exists
  if (!document.getElementById('spinner-style')) {
    const style = document.createElement('style');
    style.id = 'spinner-style';
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  closeBtn.style.display = 'none';

  // Send to background script with full conversation thread
  browser.runtime.sendMessage({
    action: 'analyzeContent',
    data: {
      originalPost: data.originalPost,
      flaggedContent: data.flaggedContent,
      conversationThread: data.flaggedContent?.conversationThread || [],
    },
  }).then((response) => {
    console.log('[Content] sendMessage response:', response);
    // Response might be boolean true (from async handler) or an object
    if (response && typeof response === 'object' && !response.success) {
      console.error('[Content] Analysis request failed:', response.error);
      showErrorOverlay(response.error || 'Analysis failed');
    } else {
      console.log('[Content] Analysis request successful, waiting for analysisResult message...');
      // The actual result will arrive via the analysisResult message listener
    }
  }).catch((error) => {
    console.error('[Content] Error sending to background:', error);
    showErrorOverlay(error.message);
  });
}

/**
 * Show error overlay
 */
function showErrorOverlay(errorMessage) {
  const existingBackdrop = document.getElementById('nextdoor-moderator-backdrop');
  const existingOverlay = document.getElementById('nextdoor-moderator-overlay');
  existingBackdrop?.remove();
  existingOverlay?.remove();

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'nextdoor-moderator-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    backdrop-filter: blur(2px);
  `;

  const overlay = document.createElement('div');
  overlay.id = 'nextdoor-moderator-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    background: white;
    border: 2px solid #f44336;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;

  overlay.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; color: #c62828;">Error</h3>
      <button id="close-overlay" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
    </div>
    <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828;">
      ${errorMessage}
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(overlay);

  const removeOverlay = () => {
    backdrop.remove();
    overlay.remove();
  };

  overlay.querySelector('#close-overlay').addEventListener('click', removeOverlay);
  backdrop.addEventListener('click', removeOverlay);
  overlay.addEventListener('click', (e) => e.stopPropagation());
}

/**
 * Show analysis result overlay
 */
function showAnalysisOverlay(analysisText) {
  const existingBackdrop = document.getElementById('nextdoor-moderator-backdrop');
  const existingOverlay = document.getElementById('nextdoor-moderator-overlay');
  existingBackdrop?.remove();
  existingOverlay?.remove();

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'nextdoor-moderator-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    backdrop-filter: blur(2px);
  `;

  const overlay = document.createElement('div');
  overlay.id = 'nextdoor-moderator-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    max-height: 80vh;
    overflow-y: auto;
    background: white;
    border: 2px solid #4CAF50;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;

  overlay.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; color: #333;">AI Analysis</h3>
      <button id="close-overlay" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
    </div>
    <div style="background: #f5f5f5; padding: 16px; border-radius: 4px; line-height: 1.6; color: #333; font-size: 14px;">
      ${formatAIAnalysis(analysisText)}
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(overlay);

  const removeOverlay = () => {
    console.log('[Content] Removing AI analysis overlay');
    const b = document.getElementById('nextdoor-moderator-backdrop');
    const o = document.getElementById('nextdoor-moderator-overlay');
    if (b) b.remove();
    if (o) o.remove();
  };

  // Add event listeners after elements are in DOM
  setTimeout(() => {
    const closeButton = document.getElementById('close-overlay');
    if (closeButton) {
      console.log('[Content] Close button found, attaching listener');
      closeButton.addEventListener('click', (e) => {
        console.log('[Content] Close button clicked');
        e.stopPropagation();
        removeOverlay();
      });
    } else {
      console.error('[Content] Close button not found!');
    }

    backdrop.addEventListener('click', (e) => {
      console.log('[Content] Backdrop clicked');
      removeOverlay();
    });

    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }, 50);
}

/**
 * Apply color and emoji styling to Vote Suggestion line
 */
function styleVoteSuggestion(analysisText) {
  if (!analysisText) return analysisText;

  // Define vote styling
  const voteStyles = {
    'keep': {
      color: '#2e7d32',
      emoji: '✓',
      label: 'Keep'
    },
    'remove': {
      color: '#c62828',
      emoji: '✗',
      label: 'Remove'
    },
    'maybe remove': {
      color: '#757575',
      emoji: '−',
      label: 'Maybe Remove'
    },
    'abstain': {
      color: '#757575',
      emoji: '−',
      label: 'Abstain'
    }
  };

  // Find and replace Vote Suggestion line
  // Regex to match: **Vote Suggestion:** Keep or Remove or Maybe Remove
  const voteRegex = /\*\*Vote Suggestion:\*\*\s*(Keep|Remove|Maybe Remove|Abstain)/i;

  const styledText = analysisText.replace(voteRegex, (match, voteType) => {
    const voteLower = voteType.toLowerCase();
    const style = voteStyles[voteLower] || voteStyles['maybe remove']; // fallback to gray

    return `<strong>Vote Suggestion:</strong> <span style="color: ${style.color}; font-weight: bold;">${style.emoji} ${style.label}</span>`;
  });

  return styledText;
}

/**
 * Listen for messages from background script
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] ===== Received message from background =====');
  console.log('[Content] Message action:', message.action);
  console.log('[Content] Full message:', message);

  // Handle API call start
  if (message.action === 'moderationFeedLoading') {
    console.log('[Content] ModerationFeed API call detected - setting loading state');
    dataIsValid = false;
    moderationFeedData = null;  // Clear stale data
    setButtonLoading();

    // Close any existing overlay from previous post
    const existingOverlay = document.getElementById('nextdoor-moderator-overlay');
    const existingBackdrop = document.getElementById('nextdoor-moderator-backdrop');
    existingOverlay?.remove();
    existingBackdrop?.remove();

    sendResponse({ success: true });
    return;
  }

  if (message.action === 'moderationDataReady') {
    console.log('[Content] ✓ Received moderation data from background script');
    console.log('[Content] Data keys:', message.data ? Object.keys(message.data) : 'null');
    console.log('[Content] Full data:', message.data);
    moderationFeedData = message.data;
    dataIsValid = true;  // Mark data as valid
    console.log('[Content] ✓ moderationFeedData stored successfully');
    enableButton();  // Enable button now that data is ready
    sendResponse({ success: true });
    return;
  }

  if (message.action === 'scanPage') {
    const result = extractModerationData();
    sendResponse({ success: true, data: result });
  }

  if (message.action === 'analysisResult') {
    console.log('[Content] Received analysisResult:', message);

    // Find the analysis container in the existing overlay
    const analysisContainer = document.querySelector('#ai-analysis-container');
    const analyzeBtn = document.querySelector('#analyze-btn');

    if (analysisContainer && analyzeBtn) {
      // Inject analysis into the container
      if (message.analysis?.analysisText) {
        console.log('[Content] Displaying analysis in overlay:', message.analysis.analysisText.substring(0, 100));
        // Apply vote suggestion styling before formatting
        const styledAnalysisText = styleVoteSuggestion(message.analysis.analysisText);
        const formattedAnalysis = formatAIAnalysis(styledAnalysisText);
        analysisContainer.innerHTML = `
          <div style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 16px; margin-top: 12px;">
            ${formattedAnalysis}
          </div>
        `;
        // Remove cache banner if present (this is fresh analysis)
        analysisContainer.querySelector('#cache-banner')?.remove();
        // Scroll into view
        analysisContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Attach copy button handlers
        analysisContainer.querySelectorAll('[data-copy-text]').forEach(btn => {
          btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.copyText).then(() => {
              btn.textContent = 'Copied!';
              setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
            });
          });
        });
        // Save analysis to localStorage
        const overlayEl = document.querySelector('#nextdoor-moderator-overlay');
        const pid = overlayEl?.dataset?.postId;
        if (pid) {
          const ctx = document.querySelector('#additional-context')?.value?.trim() || '';
          savePostReview(pid, { additionalContext: ctx, analysisHtml: analysisContainer.innerHTML });
        }
      } else {
        console.error('[Content] No analysisText in message:', message);
        analysisContainer.innerHTML = `
          <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828;">
            No analysis result received
          </div>
        `;
      }

      // Re-enable the analyze button
      analyzeBtn.disabled = false;
      analyzeBtn.style.cursor = 'pointer';
      analyzeBtn.style.opacity = '1';
      analyzeBtn.innerHTML = '🤖 Analyze with AI';
    } else {
      console.warn('[Content] Analysis container not found, falling back to legacy behavior');
      // Fallback to old behavior if container doesn't exist (shouldn't happen)
      if (message.analysis?.analysisText) {
        // Apply vote suggestion styling before displaying
        const styledAnalysisText = styleVoteSuggestion(message.analysis.analysisText);
        showAnalysisOverlay(styledAnalysisText);
      } else {
        showErrorOverlay('No analysis result received');
      }
    }

    sendResponse({ success: true });
  }

  if (message.action === 'analysisError') {
    console.error('[Content] Received analysisError:', message.error);

    // Find the analysis container in the existing overlay
    const analysisContainer = document.querySelector('#ai-analysis-container');
    const analyzeBtn = document.querySelector('#analyze-btn');

    if (analysisContainer && analyzeBtn) {
      // Display error in the container
      analysisContainer.innerHTML = `
        <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828;">
          ${message.error || 'Analysis failed'}
        </div>
      `;

      // Re-enable the analyze button
      analyzeBtn.disabled = false;
      analyzeBtn.style.cursor = 'pointer';
      analyzeBtn.style.opacity = '1';
      analyzeBtn.innerHTML = '🤖 Analyze with AI';
    } else {
      // Fallback to error overlay
      showErrorOverlay(message.error || 'Analysis failed');
    }

    sendResponse({ success: true });
  }

  return true;
});

/**
 * Check if we're on a moderation page
 */
function checkIfModerationPage() {
  if (!window.location.href.includes('nextdoor.com')) return false;
  return window.location.pathname.includes('/moderation_feed');
}

/**
 * Enable the analyze button
 */
function enableButton() {
  const button = document.getElementById('nextdoor-moderator-trigger');
  if (button) {
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
    button.style.background = '#4CAF50';  // Green
    button.textContent = 'Analyze Post';
  }
}

/**
 * Disable the analyze button
 */
function disableButton() {
  const button = document.getElementById('nextdoor-moderator-trigger');
  if (button) {
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    button.style.background = '#9E9E9E';
  }
}

/**
 * Set button to loading state
 */
function setButtonLoading() {
  const button = document.getElementById('nextdoor-moderator-trigger');
  if (!button) return;

  button.disabled = true;
  button.style.opacity = '0.7';
  button.style.cursor = 'not-allowed';
  button.style.background = '#FF9800';  // Orange
  button.textContent = '⏳ Loading...';
}

/**
 * Update button state based on current page
 */
function updateButtonState() {
  if (checkIfModerationPage()) {
    enableButton();
    // console.log('[Nextdoor Moderator] Moderation page detected - button enabled');
  } else {
    disableButton();
    // console.log('[Nextdoor Moderator] Not a moderation page - button disabled');
  }
}

/**
 * Create and inject the "Analyze Post" button
 */
function injectButton() {
  console.log('[Nextdoor Moderator] injectButton() called');
  console.log('[Nextdoor Moderator] Current URL:', window.location.href);
  console.log('[Nextdoor Moderator] document.body exists:', !!document.body);

  if (!window.location.href.includes('nextdoor.com')) {
    console.log('[Nextdoor Moderator] Not on nextdoor.com, skipping button injection');
    return;
  }

  // Check if button already exists
  if (document.getElementById('nextdoor-moderator-trigger')) {
    console.log('[Nextdoor Moderator] Button already exists, skipping');
    return;
  }

  const button = document.createElement('button');
  button.id = 'nextdoor-moderator-trigger';
  button.textContent = 'Analyze Post';
  button.disabled = true;
  button.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    padding: 12px 24px;
    background: #9E9E9E;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: bold;
    cursor: not-allowed;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 9999;
    opacity: 0.5;
  `;

  button.addEventListener('click', () => {
    if (button.disabled || !dataIsValid) {
      console.log('[Content] Button clicked but data not ready');
      return;
    }

    const result = extractModerationData();
    createContentOverlay(result);
  });

  document.body.appendChild(button);

  // Initial state check
  updateButtonState();

  // Watch for URL changes (SPA navigation) - lightweight approach
  // Listen for browser back/forward navigation
  window.addEventListener('popstate', updateButtonState);

  // Check for SPA navigation via URL changes (lightweight, 1-second interval)
  let lastUrl = window.location.href;
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      updateButtonState();
    }
  }, 1000);

  console.log('[Nextdoor Moderator] Button added with conditional enabling');
}

// Initialize button when DOM is ready
// Note: We run at document_start for interceptors, but need to wait for body to inject button
function waitForBody() {
  console.log('[Nextdoor Moderator] waitForBody() called, readyState:', document.readyState);

  if (document.body) {
    console.log('[Nextdoor Moderator] Body exists, injecting button now');
    injectButton();
  } else {
    console.log('[Nextdoor Moderator] Body does not exist yet, setting up observer');
    // Body doesn't exist yet, wait for it
    const observer = new MutationObserver(() => {
      if (document.body) {
        console.log('[Nextdoor Moderator] Body appeared, injecting button');
        observer.disconnect();
        injectButton();
      }
    });
    observer.observe(document.documentElement, { childList: true });
  }
}

console.log('[Nextdoor Moderator] Script execution started');
console.log('[Nextdoor Moderator] readyState:', document.readyState);

// Install interceptors immediately (document_start)
// But wait for body before injecting button
if (document.readyState === 'loading') {
  console.log('[Nextdoor Moderator] Document still loading, waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', waitForBody);
} else {
  console.log('[Nextdoor Moderator] Document already loaded, calling waitForBody immediately');
  waitForBody();
}
