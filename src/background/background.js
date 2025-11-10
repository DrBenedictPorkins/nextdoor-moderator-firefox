/**
 * Background page for Nextdoor Moderator Extension
 * Handles API communication with LLM service
 */

console.log('[Nextdoor Moderator] Background page initialized');

// Enable/disable LLM conversation logging
const ENABLE_LLM_LOGGING = true;

// Configuration - users should set this via the popup UI
const CONFIG = {
  apiKey: '',
  apiEndpoint: '', // e.g., OpenAI, Anthropic, etc.
  model: 'gpt-4', // Default model
};

// Nextdoor Community Guidelines (simplified - expand as needed)
const NEXTDOOR_GUIDELINES = `
## Nextdoor Community Guidelines

### 1. Be respectful to your neighbors  
Treat others the way you’d want to be treated. It’s okay for neighbors to disagree, but attacking, bullying, belittling, harassing, threatening, trolling or using excessive swearing is not allowed.  
**No public shaming:** Posts, images, videos or other media published with the clear intent to shame another person or group are disallowed.  
**What’s allowed:**  
- Posting about safety concerns or other local misconduct.  
- Posting a negative review of a local business or service-provider based on direct personal experience.  
- Posting a photo of someone’s license plate to alert the driver of a potential parking violation (so long as it follows all other guidelines).  
**What’s not allowed:**  
- Disparaging comments about a crime victim or insinuating victim responsibility.  
- Name-calling, personal attacks, libel or slander of a business.  
- Geo-tagging a neighbour’s home without their knowledge.  
- Posting a photo of someone’s license plate to humiliate them.  
**Special note about people experiencing homelessness:**  
While it is permissible to share photos/videos and express concern for local safety or conditions, posts or comments that shame or humiliate people experiencing homelessness may be removed.

---

### 2. Do not discriminate  
Racism, hate speech and/or discrimination of any kind is expressly prohibited — whether conscious or unconscious. Nextdoor should bring people together, not push them apart.  
**Support for equity & equality:**  
We stand in solidarity with movements advocating for racial justice, civil rights and the LGBTQIA+ community. Content posted in *opposition to*, or as a *rebuttal of* support for equity & equality for historically marginalized groups is harmful and prohibited.  
**Specifically prohibited content includes:**  
- “All Lives Matter” when used to diminish racial equality efforts.  
- “Blue Lives Matter” when used to diminish racial equality efforts (though honouring law enforcement is permitted when respectful).  
- “White Lives Matter”, as most commonly associated with white-supremacist groups.  
- Homophobia, biphobia, transphobia, or other mistreatment based on sexual orientation or gender identity.  
**Understanding racial profiling:**  
Racial profiling — when race or ethnicity is used as grounds for suspecting someone of wrongdoing — is a form of discrimination and is not allowed.

---

### 3. Discuss important topics in the right place  
Real-world impact often begins in the local community — Nextdoor is the place for neighbours to discuss these topics in a kind and community-oriented way.  
**Politics:**  
Discussions about non-local topics (national partisan politics or international geopolitical issues) without a direct local or personal connection may only take place in neighbour-created groups. They may appear in the main feed *ONLY* if there is a direct local connection or personal experience and all other guidelines are met.  
**Religion:**  
Discussions about religion must take place in neighbour-created groups. Posts or comments referencing religion in the main newsfeed are subject to removal unless they have a direct local or personal connection.

---

### 4. Use your true identity  
Every neighbour should use their real name and a confirmed address. Accounts that mis-represent identity may be reviewed or removed.  
Note: Moderators may not have the ability to view verification status or force removal of accounts — these issues go through Nextdoor Support.

---

### 5. Do not engage in harmful activity  
Any activity that could hurt someone — from physical harm to scams — is strictly prohibited.  
**Threats of violence (even in jest):**  
Threatening harm toward another neighbour or group of people (e.g., thieves, people experiencing homelessness) is not acceptable.  
**Gun violence / weapons:**  
It is against the Member Agreement to use Nextdoor to sell weapons or ammunition. Threatening gun violence (even out of frustration or jest) is prohibited.  
**Illicit or dangerous actions:**  
Encouraging or facilitating illegal or dangerous actions is disallowed.

--- 

_End of Guidelines_
`;

/**
 * Load configuration from storage
 */
async function loadConfig() {
  const stored = await browser.storage.local.get(['apiKey', 'apiEndpoint', 'model']);
  if (stored.apiKey) CONFIG.apiKey = stored.apiKey;
  if (stored.apiEndpoint) CONFIG.apiEndpoint = stored.apiEndpoint;
  if (stored.model) CONFIG.model = stored.model;
}

/**
 * Save configuration to storage
 */
async function saveConfig(config) {
  await browser.storage.local.set(config);
  Object.assign(CONFIG, config);
}

/**
 * Save LLM conversation logs to markdown files
 */
async function saveLLMConversation(filename, content) {
  if (!ENABLE_LLM_LOGGING) return;

  try {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    await browser.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'overwrite'
    });

    console.log(`[Background] Saved ${filename}`);

    // Clean up the blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error(`[Background] Failed to save ${filename}:`, error);
  }
}

/**
 * Call LLM API to analyze content
 */
async function analyzeWithLLM(originalPost, flaggedContent, conversationThread = [], additionalContext = '') {
  if (!CONFIG.apiKey || !CONFIG.apiEndpoint) {
    throw new Error('API configuration not set. Please configure in extension popup.');
  }

  // Build conversation thread text for prompt
  let threadText = '';
  let parentCommentInfo = null;

  if (conversationThread && conversationThread.length > 0) {
    threadText = '\n\nCONVERSATION THREAD (indentation shows reply relationships):\n';

    conversationThread.forEach((msg, idx) => {
      const indent = '  '.repeat(Math.max(0, msg.depth || 0));
      threadText += `${indent}→ ${msg.author}: "${msg.content}"\n`;

      // If this is the second-to-last message (before flagged content), it's the parent
      if (idx === conversationThread.length - 2) {
        parentCommentInfo = {
          author: msg.author,
          content: msg.content,
          depth: msg.depth
        };
      }
    });
  }

  // Build additional context section if provided
  let additionalContextText = '';
  let hasAdditionalContext = false;
  if (additionalContext) {
    additionalContextText = `\n\nADDITIONAL CONTEXT (provided by moderator):\n${additionalContext}\n`;
    hasAdditionalContext = true;
  }

  // Extract moderation details
  const moderationDetails = flaggedContent?.moderationDetails || {};

  // Build report summary with vote counts and tags
  let reportSummary = '';
  if (moderationDetails.reports && moderationDetails.reports.length > 0) {
    reportSummary += `\n\nREPORTS (${moderationDetails.totalReports || 0} total):\n`;
    moderationDetails.reports.forEach((report) => {
      if (report.type === 'individual_report') {
        const voteLabel = report.voteType === 'keep' ? 'Keep' : report.voteType === 'remove' ? 'Remove' : report.voteType === 'abstain' ? 'Maybe Remove' : 'Report';
        reportSummary += `- ${report.reporterName} (${voteLabel})`;
        if (report.reportType) reportSummary += `: "${report.reportType}"`;
        if (report.additionalNote) reportSummary += ` - Comment: "${report.additionalNote}"`;
        reportSummary += '\n';
      } else if (report.type === 'row') {
        reportSummary += `- ${report.reason}: ${report.count}\n`;
      } else if (report.type === 'section') {
        reportSummary += `  ${report.text}\n`;
      }
    });
  }

  // Build votes summary with comments
  let votesSummary = '';
  if (moderationDetails.votes && moderationDetails.votes.length > 0) {
    votesSummary += `\n\nCOMMUNITY VOTES (${moderationDetails.totalVotes || 0} total):\n`;
    moderationDetails.votes.forEach((vote) => {
      if (vote.type === 'individual_vote') {
        const voteLabel = vote.voteType === 'keep' ? 'Keep' : vote.voteType === 'remove' ? 'Remove' : vote.voteType === 'abstain' ? 'Maybe Remove' : 'Unknown';
        votesSummary += `- ${vote.voterName} (${voteLabel})`;
        if (vote.additionalNote) votesSummary += ` - Comment: "${vote.additionalNote}"`;
        votesSummary += '\n';
      } else if (vote.type === 'row') {
        votesSummary += `- ${vote.reason}: ${vote.count}\n`;
      }
    });
  }

  // Build notes summary
  let notesSummary = '';
  if (moderationDetails.notes && moderationDetails.notes.length > 0) {
    notesSummary += `\n\nMODERATOR NOTES (${moderationDetails.totalNotes || 0} total):\n`;
    moderationDetails.notes.forEach((note, idx) => {
      notesSummary += `${idx + 1}. ${note.text}\n`;
    });
  }

  const prompt = `You are an independent content moderator analyzing flagged content from a Nextdoor community moderation queue.

CRITICAL INSTRUCTIONS:
• Your analysis must be INDEPENDENT - do not blindly follow reporter tags or voting trends
• Many reports are automated or reflect personal disagreements rather than actual guideline violations
• Public shaming tags are frequently misapplied to legitimate policy critiques of public figures
• Political discourse about elected officials or candidates is generally permitted as long as it remains respectful
• Only recommend removal if the content CLEARLY violates specific guidelines

IMPORTANT - FOCUS YOUR ANALYSIS:
• Your vote should ONLY evaluate the "FLAGGED CONTENT" below
• The "ORIGINAL POST" and conversation thread are provided for CONTEXT ONLY
• Do NOT vote on whether the original post or thread violates guidelines
• ONLY analyze whether the specific flagged content (post or comment) violates guidelines
• Tags and reports apply to the flagged content, not the entire thread

${NEXTDOOR_GUIDELINES}

ORIGINAL POST (for context only):
Author: ${originalPost?.author || 'Unknown'}
Content: ${originalPost?.content || 'Not available'}
${threadText}
${parentCommentInfo && parentCommentInfo.depth >= 0 ?
`
RESPONSE RELATIONSHIP:
The flagged content below is responding to ${parentCommentInfo.author}'s comment:
"${parentCommentInfo.content}"

Focus your analysis primarily on the flagged content and its relationship to this specific comment. The entire conversation thread above provides background context, but evaluate whether the flagged response is appropriate given what it's responding to.
` :
'\nThe flagged content below is responding directly to the original post.\n'}
FLAGGED CONTENT (this is what you are evaluating):
Author: ${flaggedContent?.author || 'Unknown'}
Content: ${flaggedContent?.content || 'Not available'}
${additionalContextText}${reportSummary}${votesSummary}${notesSummary}

YOUR ANALYSIS TASK:

Step 1 - EVALUATE EACH TAG INDEPENDENTLY:
For each flag/tag applied, determine if it is:
• "Valid" = Content clearly violates the specific guideline (tone, target, intent, context all match the violation criteria)
• "Doesn't Apply" = Content does NOT meet the violation criteria for this tag
• "Borderline" = Ambiguous; may partially align but mitigating context exists

For each tag, ask yourself:
- Which specific guideline does this tag enforce?
- Does the content target a private individual or a public figure/candidate?
- Is this a personal attack or a policy/ideology critique?
- Is the tone genuinely disrespectful or merely critical/disagreeing?
- Does context justify the content (political debate, community issue discussion)?

Step 2 - MAKE YOUR VOTE DECISION:
Based on your tag analysis:
• If ALL tags are "Doesn't Apply" → Vote = Keep
• If majority of tags are "Valid" with clear guideline violations → Vote = Remove
• If tags are mixed "Valid"/"Borderline" or significant ambiguity exists → Vote = Maybe Remove
• Political speech criticizing public figures should generally be Keep unless clearly violating respect guidelines

Step 3 - FORMAT YOUR RESPONSE:

**Tag Analysis:**
[For each report tag, state: Tag name | Guideline violated | Valid/Doesn't Apply/Borderline | Brief reasoning]

**Vote Suggestion:** [Keep | Remove | Maybe Remove]

**Why:** [Explain your vote based on tag analysis - ensure this matches your vote! If you found tags don't apply, vote Keep. If tags are valid violations, vote Remove.]

**Comment Suggestion:** [A brief, scannable phrase (5-10 words max) explaining your vote. Format: "reason - context" or "violation type - target". Examples: "political critique - public figure, not personal attack" OR "personal attack - violates respect guideline" OR "borderline tone - political debate context" OR "policy discussion - local issue relevance" OR "off-topic - national politics, not local"]
${hasAdditionalContext ? '\n**Moderator Questions/Comments:**\n[Address any questions or comments from the "ADDITIONAL CONTEXT (provided by moderator)" section. If the moderator asked specific questions, answer them directly. If they provided context about media (images, videos, links), acknowledge how this context affects your analysis.]' : ''}
**Additional Context:**
- Voting trend: [what other reviewers voted]
- Reviewer comments: [any comments from reviewers]
- Tone assessment: [respectful debate vs personal attack vs harassment]
- Mitigating factors: [political speech, public figure, community issue discussion, etc.]

IMPORTANT: Your "Vote Suggestion" MUST logically match your "Tag Analysis" and "Why" explanation. Do not recommend "Remove" if you concluded the content doesn't violate guidelines.`;

  // Build request body
  const requestBody = {
    model: CONFIG.model,
    messages: [
      {
        role: 'system',
        content: 'You are an expert content moderation assistant for Nextdoor communities. Provide concise, well-formatted recommendations following the exact structure requested. Consider report tags, voting trends, reviewer comments, tone, and guideline violations. Be brief but thorough.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3, // Lower temperature for more consistent moderation decisions
  };

  // Log request payload
  if (ENABLE_LLM_LOGGING) {
    const systemMessage = requestBody.messages.find(m => m.role === 'system');
    const userMessage = requestBody.messages.find(m => m.role === 'user');

    const requestLog = `# LLM Request Payload

**Timestamp**: ${new Date().toISOString()}
**Endpoint**: ${CONFIG.apiEndpoint}
**Model**: ${CONFIG.model}

---

## System Prompt

\`\`\`
${systemMessage?.content || 'N/A'}
\`\`\`

---

## User Prompt

\`\`\`
${userMessage?.content || 'N/A'}
\`\`\`

---

## Full Request Body

\`\`\`json
${JSON.stringify(requestBody, null, 2)}
\`\`\`
`;

    await saveLLMConversation('llm-request.md', requestLog);
  }

  // This is a generic API call structure - adapt based on your chosen LLM provider
  const response = await fetch(CONFIG.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsedResponse = parseAnalysisResponse(data);

  // Log response payload
  if (ENABLE_LLM_LOGGING) {
    const assistantMessage = data.choices?.[0]?.message?.content ||
                            data.content?.[0]?.text ||
                            'N/A';

    const responseLog = `# LLM Response

**Timestamp**: ${new Date().toISOString()}
**Status**: ${response.status}

---

## Response Body

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

---

## Extracted Content

**Assistant Message**:
\`\`\`
${assistantMessage}
\`\`\`

---

## Parsed Analysis

**Analysis Text**: ${parsedResponse.analysisText || 'N/A'}
**Raw Response**: ${parsedResponse.rawResponse || 'N/A'}
**Timestamp**: ${parsedResponse.timestamp || 'N/A'}
`;

    await saveLLMConversation('llm-response.md', responseLog);
  }

  return parsedResponse;
}

/**
 * Parse LLM response into structured format
 */
function parseAnalysisResponse(apiResponse) {
  // Adapt this based on your LLM provider's response format
  const content = apiResponse.choices?.[0]?.message?.content || apiResponse.content || '';

  // For simple one-sentence analysis, just return the text
  return {
    analysisText: content.trim(),
    rawResponse: content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Handle messages from content script or popup
 */
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('[Background] Received message:', message);

  if (message.action === 'analyzeContent') {
    try {
      const { originalPost, flaggedContent, conversationThread, additionalContext } = message.data;

      // Perform analysis with full conversation context and additional context
      const analysis = await analyzeWithLLM(originalPost, flaggedContent, conversationThread, additionalContext);

      // Send results back to content script
      if (sender.tab) {
        browser.tabs.sendMessage(sender.tab.id, {
          action: 'analysisResult',
          analysis: analysis,
        });
      }

      sendResponse({ success: true, analysis: analysis });
    } catch (error) {
      console.error('[Background] Analysis error:', error);

      // Send error to content script
      if (sender.tab) {
        browser.tabs.sendMessage(sender.tab.id, {
          action: 'analysisError',
          error: error.message,
        });
      }

      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep channel open for async response
  }

  if (message.action === 'saveConfig') {
    try {
      await saveConfig(message.config);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (message.action === 'getConfig') {
    await loadConfig();
    sendResponse({ success: true, config: CONFIG });
    return true;
  }
});

// Store captured API responses
const capturedApiData = new Map(); // Map of tabId -> API response data

/**
 * Intercept API responses using webRequest API
 * This is the proper, clean way to intercept network requests in extensions
 */
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log('[Background] ===== ModerationFeed API Request Detected =====');
    console.log('[Background] URL:', details.url);
    console.log('[Background] Request ID:', details.requestId);
    console.log('[Background] Tab ID:', details.tabId);
    console.log('[Background] Type:', details.type);
    console.log('[Background] Method:', details.method);

    // Immediately notify content script that API call started
    browser.tabs.sendMessage(details.tabId, {
      action: 'moderationFeedLoading'
    }).catch(() => {}); // Ignore errors if tab not ready

    try {
      const filter = browser.webRequest.filterResponseData(details.requestId);
      const decoder = new TextDecoder('utf-8');
      let responseData = '';

      console.log('[Background] Filter created successfully for request', details.requestId);

      filter.ondata = (event) => {
        console.log('[Background] Filter.ondata called, received', event.data.byteLength, 'bytes');
        const str = decoder.decode(event.data, { stream: true });
        responseData += str;
        filter.write(event.data);
      };

      filter.onstop = () => {
        console.log('[Background] Filter.onstop called');
        console.log('[Background] Total response data length:', responseData.length);
        console.log('[Background] First 200 chars:', responseData.substring(0, 200));

        try {
          const data = JSON.parse(responseData);
          console.log('[Background] ✓ Successfully parsed JSON response');
          console.log('[Background] Response keys:', Object.keys(data));
          console.log('[Background] Full data:', data);

          // Store the data associated with the tab
          capturedApiData.set(details.tabId, data);
          console.log('[Background] ✓ Stored data for tab', details.tabId);
          console.log('[Background] capturedApiData size:', capturedApiData.size);

          // Notify the content script that data is ready
          browser.tabs.sendMessage(details.tabId, {
            action: 'moderationDataReady',
            data: data,
          }).then(() => {
            console.log('[Background] ✓ Message sent to content script successfully');
          }).catch(err => {
            console.error('[Background] ✗ Failed to send to content script:', err.message);
          });

        } catch (error) {
          console.error('[Background] ✗ Error parsing API response:', error);
          console.error('[Background] Response data:', responseData.substring(0, 500));
        }
        filter.disconnect();
        console.log('[Background] Filter disconnected');
      };

      filter.onerror = (error) => {
        console.error('[Background] ✗ Filter error:', error);
      };

    } catch (error) {
      console.error('[Background] ✗ Error setting up filter:', error);
      console.error('[Background] Error stack:', error.stack);
    }
  },
  {
    urls: [
      '*://nextdoor.com/api/gql/ModerationFeed',
      '*://nextdoor.com/api/gql/ModerationFeed?',
      '*://nextdoor.com/api/gql/ModerationFeed?*',
      '*://*.nextdoor.com/api/gql/ModerationFeed',
      '*://*.nextdoor.com/api/gql/ModerationFeed?',
      '*://*.nextdoor.com/api/gql/ModerationFeed?*'
    ]
  },
  ['blocking']
);

// Debug listener to see ALL requests to nextdoor API
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log('[Background] [DEBUG] Any nextdoor API request detected:');
    console.log('[Background] [DEBUG] URL:', details.url);
    console.log('[Background] [DEBUG] Method:', details.method);
  },
  {
    urls: ['*://nextdoor.com/api/*', '*://*.nextdoor.com/api/*'],
  }
);

console.log('[Background] webRequest listener installed for ModerationFeed API');

// Load configuration on startup
loadConfig();
