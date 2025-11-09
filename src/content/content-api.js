/**
 * Content script for Nextdoor Moderator Extension
 * Uses API interception to capture moderation feed data
 */

console.log('[Nextdoor Moderator] Content script loaded (API mode)');

// Store the latest moderation feed data
let moderationFeedData = null;
let dataIsValid = false;

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

    const originalPost = {
      id: post.id,
      legacyId: feedItem.legacyAnalyticsId,
      content: postContent,
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
     */
    function findFlaggedCommentsRecursive(edges, parentThread = [], depth = 0) {
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
          createdAt: comment.createdAt?.asDateTime?.relativeTime || '',
          depth: depth,
        };

        // Check if this comment is flagged
        if (comment.moderationInfo?.moderationSummaryV3) {
          const commentModerationDetails = parseModerationSummary(comment.moderationInfo.moderationSummaryV3);
          flaggedComments.push({
            ...commentData,
            moderationSummary: comment.moderationInfo.moderationSummaryV3,
            moderationDetails: commentModerationDetails,
            // Full conversation thread: parent chain + this flagged comment
            conversationThread: [...parentThread, commentData],
          });
        }

        // Recursively search nested replies
        // Note: Replies are at edge.node.replies.edges, NOT comment.pagedNestedReplies
        const nestedReplies = edge.node?.replies?.edges || [];
        if (nestedReplies.length > 0) {
          findFlaggedCommentsRecursive(
            nestedReplies,
            [...parentThread, commentData], // Add current comment to thread
            depth + 1
          );
        }
      });
    }

    // Start recursive search from top-level comments
    // Include the original post in the conversation thread
    const originalPostContext = {
      id: post.id,
      legacyId: feedItem.legacyAnalyticsId,
      content: originalPost.content,
      author: originalPost.author,
      authorUrl: originalPost.authorUrl,
      createdAt: originalPost.createdAt,
      depth: -1, // Mark as original post (before comments)
      isOriginalPost: true,
    };

    const topLevelComments = post.comments?.pagedComments?.edges || [];
    findFlaggedCommentsRecursive(topLevelComments, [originalPostContext]);

    // Determine what is flagged
    const validation = {
      hasOriginalPost: !!originalPost.content,
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

  // Split into sections and format
  let html = '';
  const lines = text.split('\n');

  lines.forEach(line => {
    line = line.trim();
    if (!line) {
      html += '<br>';
      return;
    }

    // Check if it's a bullet point
    if (line.startsWith('- ')) {
      html += `<div style="margin-left: 20px; margin-bottom: 8px;">• ${line.substring(2)}</div>`;
    }
    // Check if it's a section header (contains strong tag at start)
    else if (line.match(/^<strong>[^<]+:<\/strong>/)) {
      html += `<div style="margin-top: 16px; margin-bottom: 8px; font-size: 16px;">${line}</div>`;
    }
    // Regular paragraph
    else {
      html += `<div style="margin-bottom: 8px;">${line}</div>`;
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
function createContentOverlay(result) {
  if (!result.success) {
    showErrorOverlay(result.error);
    return;
  }

  const { data } = result;
  const { originalPost, flaggedContent, validation } = data;

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
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
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

  let contentHTML = '';

  // Validation errors
  if (!validation.hasOriginalPost) {
    contentHTML += `
      <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 4px; padding: 12px; color: #c62828; margin-bottom: 12px;">
        <strong>Error:</strong> Could not find original post
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

  overlay.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; color: #333;">Content Review (API Data)</h3>
      <button id="close-overlay" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
    </div>
    ${contentHTML}
    <div style="margin-top: 16px; border-top: 2px solid #ddd; padding-top: 16px;">
      <div style="margin-bottom: 12px;">
        <label for="additional-context" style="display: block; font-weight: bold; margin-bottom: 6px; font-size: 13px; color: #555;">
          Additional Context (optional)
        </label>
        <textarea
          id="additional-context"
          placeholder="Describe images, videos, links, or other context not visible in the text (e.g., 'Post includes image of political yard sign' or 'Video shows heated argument')"
          style="
            width: 100%;
            min-height: 60px;
            max-height: 200px;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 13px;
            resize: vertical;
            box-sizing: border-box;
          "
        ></textarea>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">
          This context will be included in the LLM analysis to provide additional information about media or context not visible in the text.
        </div>
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

  // Add backdrop and overlay to DOM
  document.body.appendChild(backdrop);
  document.body.appendChild(overlay);

  // Remove function for cleanup
  const removeOverlay = () => {
    backdrop.remove();
    overlay.remove();
  };

  // Close button handler
  const closeBtn = overlay.querySelector('#close-overlay');
  closeBtn?.addEventListener('click', removeOverlay);

  // Click outside to close (click on backdrop)
  backdrop.addEventListener('click', removeOverlay);

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

    // Send to background script with additional context
    browser.runtime.sendMessage({
      action: 'analyzeContent',
      data: {
        originalPost: data.originalPost,
        flaggedContent: data.flaggedContent,
        conversationThread: data.flaggedContent?.conversationThread || [],
        additionalContext: additionalContext,
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
        const formattedAnalysis = formatAIAnalysis(message.analysis.analysisText);
        analysisContainer.innerHTML = `
          <div style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 16px; margin-top: 12px;">
            ${formattedAnalysis}
          </div>
        `;
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
        showAnalysisOverlay(message.analysis.analysisText);
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
