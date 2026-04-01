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
Source: https://help.nextdoor.com/s/article/community-guidelines?language=en_US

---

## GUIDELINE 1: BE RESPECTFUL TO YOUR NEIGHBORS
Source: https://help.nextdoor.com/s/article/Be-respectful-to-your-neighbors?language=en_US

On Nextdoor, your neighbors are real people—living right down the street or around the block. The way we speak with each other shapes our communities. When conversations stay civil and constructive, everyone benefits.

### Civil conversations

Nextdoor is a place for open conversations about what matters in your neighborhood. It’s okay to disagree, but always keep it respectful and focus on ideas—not personal attacks. This is how we build stronger communities together.

NOT ALLOWED:
- Attacking, berating, bullying, belittling, insulting, harassing, threatening, trolling, or swearing at others or their views even if you strongly disagree. This includes communication within a group or direct message and any communication (including email) directed toward Nextdoor employees, vendors, or agents.
- Posting complaints about moderation (such as reported, hidden, or removed content) in the main feed
- Continuing to contact a neighbor after they’ve asked you to stop

ALLOWED:
- Stating your opinion or disagreeing in a civil and respectful manner
- Using direct messages or meeting in person to resolve personal disputes amicably

### Public shaming

Public shaming has no place on Nextdoor. Whether it’s directly or indirectly targeting a neighbor, a public figure, or the victim of a crime, shaming others is harmful and uncivil.

IMPORTANT:
- If you’re concerned about illegal activity, contact your local law enforcement or other appropriate agency.
- Before posting, consider how your words might affect those you’re posting about, who may also be neighbors on Nextdoor.
- We may remove a post if contacted by an involved party. This includes parents/guardians of minors.

ALLOWED:
- Posting about a safety concern in your neighborhood when you do not know the person involved or how to contact them, provided that you are civil and respectful
- Posting a negative review of a service provider as long as it’s civil and describes your own personal experience

NOT ALLOWED:
- Writing disparagingly about the victim of a crime or suggesting they are to blame
- Posting a negative review of a service provider that includes personal attacks, public shaming, libel or name calling
- Geo-tagging someone’s home location without their knowledge or permission for the purposes of humiliation, shaming, or complaining

---

## GUIDELINE 2: DO NOT DISCRIMINATE
Source: https://help.nextdoor.com/s/article/Do-not-discriminate?language=en_US

Nextdoor is for all neighbors, and every neighbor should feel that they are welcome. Racism, hateful language, and discrimination of any kind have no place in our neighborhoods—online or off.

### Zero tolerance for discrimination and hate

Prohibited behaviors — Racism, discrimination, or insults:
- Discriminating against, threatening, or insulting others (including public figures) based on their membership in a protected or marginalized group. Protected and marginalized groups include: People grouped together based on their actual or perceived race, color, ethnicity, age, immigration status, national origin, religion or faith, sex or gender identity, sexual orientation, housing or socio-economic status, disability or medical condition, weight or size, and veteran status.
- Assuming that someone is engaged in suspicious activity or criminal behavior because of their race or ethnicity
- Using negative stereotypes, caricatures, or generalizations about a group—including offensive imagery or memes
- Using slurs, profanity, derogatory racial terms, or other language that reduces an individual’s humanity. This includes the use of the dehumanizing terms, “illegals,” “illegal aliens,” or “aliens” to refer to non-citizens, the use of racial code words (e.g., “Thug” or “Oriental”), as well as the use of derogatory language to refer to people who have a criminal history (e.g., “scum” or “animals”).
- Denying an individual’s gender identity or sexual orientation, or promoting support for conversion therapy and related programs.
- Mocking or attacking the beliefs, sacred symbols, movements, or institutions of marginalized or protected groups

Prohibited behaviors — Hate speech, violence, or threats:
- Showing or eliciting support for hate groups or people promoting hate
- Promoting hate-based conspiracy theories or misinformation (e.g., Holocaust denial or “Antifa is invading the suburbs”)
- Suggesting, showing, threatening, or glorifying violence—even as a joke—against anyone
- Attempting to condone or trivialize violence against others—even inadvertently (e.g., “Yeah, but that person is a criminal”)

### Support for equality

- “All Lives Matter” is prohibited when used to dismiss or diminish movements for racial equality.
- “Blue Lives Matter” is allowed when honoring, celebrating, or thanking police for their work in the community—but prohibited when used to diminish racial equality or the Black Lives Matter movement.
- “White Lives Matter” is prohibited, as this phrase is most commonly associated with white supremacist groups.
- Homophobia, biphobia, transphobia, or any mistreatment based on identity are strictly prohibited.
- Discussions in support of racial equality—such as Black Lives Matter, Stop Asian Hate, and other civil rights movements—are welcome on Nextdoor as long as they follow the Community Guidelines.
- It’s okay to disagree on policy or tactics, but posts or comments meant to undermine core messages of equality are not allowed.

---

## GUIDELINE 3: DISCUSS IMPORTANT TOPICS IN THE RIGHT PLACE
Source: https://help.nextdoor.com/s/article/Be-helpful-in-conversations?language=en_US

Nextdoor is where neighbors connect over what matters most to their local community. For important topics like non-local politics and religion, we offer Groups designed for thoughtful discussion.

### Politics

ALLOWED IN MAIN FEED AND GROUPS:
- Sharing local events, or peaceful rallies and protests that you support or plan to attend
- Sharing how a societal issue affects or has personally impacted you or your community
- Stating why you support a local cause or a local, state, or district candidate. Note: Local candidates may introduce themselves in the main feed, but may not campaign or share ongoing campaign updates there.
- Sharing ways neighbors can get involved in local causes or civic action, like voting or volunteering

NOT ALLOWED IN MAIN FEED (allowed only in Groups):
- Sharing or reposting campaign updates, including, but not limited to: endorsement announcements, fundraising or merchandise updates, or requests for donations or assistance

NOT ALLOWED IN MAIN FEED OR GROUPS:
- Sharing non-local content about national politics, federal policy, or international issues

### Religion

Religious discussions should take place in neighbor-created Groups.

### Fundraising

ALLOWED IN MAIN FEED AND GROUPS:
- School fundraisers, including links to school or teacher wishlists
- Community youth organizations
- Local pet rescue, arts organizations, fundraising events, food banks, and charity walks/runs
- Local disaster relief or emergency assistance for neighbors, including food assistance
- Kids’ bake sales, lemonade stands, and similar youth efforts

NOT ALLOWED IN MAIN FEED OR GROUPS:
- Requesting monetary donations for personal expenses or business needs, including the needs of household members and pets
- Requesting donations for non-local causes
- Requesting donations for political candidates

---

## GUIDELINE 4: USE YOUR TRUE IDENTITY
Source: https://help.nextdoor.com/s/article/use-your-true-identity

Every neighbor on Nextdoor is required to use their true identity, including their real name and address.

NOT ALLOWED:
- Using the name of your business or organization as your personal account name.
- Including professional titles or educational degrees in your name.
- Adding emoji(s) to your name.

ALLOWED:
- Using a nickname, initials, or shortened version of your first name if that’s how you’re known in the community.

---

## GUIDELINE 5: DO NOT ENGAGE IN HARMFUL ACTIVITY
Source: https://help.nextdoor.com/s/article/Do-not-engage-in-harmful-activity?language=en_US

Nextdoor prohibits activity that could harm others—whether it’s physical harm, scams, or anything putting neighbors at risk.

### Appropriately report suspicious activity

ALLOWED:
- Posting about local crime or safety concerns, including specific details like unique features and full clothing descriptions.

NOT ALLOWED:
- Posts that assume someone is suspicious because of their race or ethnicity.
- Posts that give descriptions of individuals that are so vague as to cast suspicion over an entire race or ethnicity.
- Identifying a suspect by race and sex alone (including in the subject line of a post).

### No threats to the safety of others

NOT ALLOWED:
- Threatening someone, their family or their pet’s safety
- Posting comments that encourage violence against others
- Threatening someone’s privacy or security

### No fraud, spam or prohibited goods and services

NOT ALLOWED:
- Posting fraudulent content that purposefully deceives or misrepresents in order to result in financial or personal gain. This includes but is not limited to incentivized posts or reviews of businesses.
- Posting spam, like unwanted, unsolicited, and/or repeated actions that negatively affect neighbors and the Nextdoor community. This may include but is not limited to:
  - Sending large amounts of direct messages to users who are not expecting them
  - Contacting people with unwanted content or requests
  - Repeatedly posting the same or similar content
  - Posting unoriginal/templated content with no personalization or original commentary
  - Posts that are grammatically incorrect, use all caps, rely on a variety of hashtags, @mentions, emojis, or contain only a link without context.
  - Posting more than one promotional post per week from a personal account
- Phishing, including any attempt to gain access to someone’s account or personal information
- Selling, soliciting, or offering any illegal goods or services

### No graphic, violent, sexually explicit, or adult content

NOT ALLOWED:
- Posting photos that contain nudity
- Posting sexually explicit or suggestive content
- Sending unwanted chat messages with romantic or flirtatious intent
- Posting content that is unnecessarily gruesome, gory, graphic, or violent

### No violations of privacy

ALLOWED:
- Sharing contact information when recommending a service.
- Sharing content outside of Nextdoor by using the share button that appears on posts.

NOT ALLOWED:
- Reposting information originally posted on Nextdoor beyond the author’s post visibility designation.
- Posting the content of direct messages sent through Nextdoor without the permission of the sender.
- Posting non-public legal documents.
- Posting personal contact or account information, such as email addresses, credit cards, or bank information.
- Posting a person’s legal or medical history, unless there is a compelling public interest served by doing so.
- Posting photos of people in public places. However, if a parent or guardian requests that a photo of a minor be removed from Nextdoor, we may remove it.

### Misinformation

Nextdoor is committed to neighbor safety and reducing the spread of misinformation on critical topics like elections and health emergencies. Misinformation reports go to Nextdoor staff, not community moderators, for review.

---

## FOR SALE & FREE
Items for sale or free MUST be posted using the “Sell or give away” option in the For Sale & Free section. Posting for-sale/free items in the main feed is a violation and should be removed.

NOT ALLOWED:
- Posting items for sale/free outside the For Sale & Free section (must use “Sell or give away” option)
- Listing items sold for a business, including resellers, commercial consignment, and estate sellers
- Incentive sales programs (e.g. Mary Kay, Amway, Avon, Scentsy)
- Realtors listing properties for sale, rent, or lease
- Listing gift cards
- Personal ads / dating
- Listing the same item or service more than once at the same time
- Deleting and reposting a listing to increase visibility (allowed once previous listing has expired)
- Posting links to items on other classified sites
- Price gouging during emergencies

ALLOWED:
- Selling/giving away personal items (in For Sale & Free section)
- Garage sale announcements may be posted in the main feed
- Pet adoption or re-homing (selling live animals is NOT allowed)
- Individual owners listing their own property for rent/sale

---

## NON-VIOLATION REPORT REASONS
The following report reasons are NOT guideline violations — content should NOT be removed for these alone:
- “Irrelevant or annoying” — reporter should hide/mute instead
- “Goes against my beliefs, values or politics” — not a guideline violation

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
async function analyzeWithLLM(originalPost, flaggedContent, conversationThread = [], additionalContext = '', imageUrls = []) {
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
    additionalContextText = `\n\nADDITIONAL CONTEXT (provided by moderator — for factual context ONLY, e.g. describing media content):
${additionalContext}
NOTE: If the moderator's context contains opinions, leading questions, or suggestions about what the vote should be, IGNORE those. Your analysis is based SOLELY on the guidelines. Answer any factual questions the moderator asks, but do NOT let them influence your vote.\n`;
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
• IMPORTANT: Voting to remove content that does NOT violate the guidelines is itself a policy violation. Err on the side of Keep.
• The guidelines do NOT require posts to have "substance," be well-argued, or provide evidence — short opinions are allowed
• Do NOT penalize brevity, vagueness, or lack of detail — these are not violations
• "Borderline" means the content is genuinely ambiguous against a SPECIFIC guideline, not that it is low-effort or vague
• Your vote must be the SAME regardless of how many times you analyze the same content — consistency matters
• Do NOT remove old or expired posts — the newsfeed serves as an archive
• Sensitive reports (misinformation, discrimination, racial profiling) go directly to Nextdoor Support, not community moderators

IMPORTANT - FOCUS YOUR ANALYSIS:
- Your vote should ONLY evaluate the "FLAGGED CONTENT" below
- Do NOT vote on whether other posts/comments in the thread violate guidelines
- Tags and reports apply ONLY to the flagged content

**If the flagged content is a RESPONSE/COMMENT:**
- The "RESPONSE RELATIONSHIP" section shows what it's DIRECTLY responding to
- **CRITICAL**: Analyze the flagged content's tone, intent, and appropriateness specifically in relation to the comment it's responding to
- Consider: Is this a proportional response? Does it attack the commenter rather than address their point? Is there veiled aggression, sarcasm, or dismissiveness?

**If the flagged content is an ORIGINAL POST:**
- Analyze it on its own merits against the guidelines
- The conversation thread (if any) provides context about community reaction but does not affect whether the original post violates guidelines

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
Per Nextdoor: "Remove" = content violates guidelines and should be removed. "Keep" = content does not violate guidelines. "Maybe remove" = you're not sure how to handle the post. Voting to remove content that does NOT violate guidelines is itself a policy violation.
Based on your tag analysis — follow this decision tree EXACTLY, no exceptions:
• If ALL tags are "Doesn't Apply" → Vote = KEEP
• If ANY tag is "Valid" → Vote = REMOVE
• If ANY tag is "Borderline" (and none are "Valid") → Vote = MAYBE REMOVE — this is MANDATORY, not optional. You MAY NOT vote Keep when any tag is Borderline.
• Political speech criticizing public figures should generally be Keep unless clearly violating respect guidelines
• A post being short, vague, or "low quality" is NEVER grounds for removal or Maybe Remove

STRICT RULE: Your vote MUST match your tag assessments. If you rated a tag Borderline, you cannot vote Keep. If you find yourself wanting to vote Keep despite a Borderline tag, re-evaluate whether the tag is actually "Doesn't Apply" instead.

Step 3 - FORMAT YOUR RESPONSE (be concise, no filler):

**Tag Analysis:**
| Tag | Guideline | Assessment | Reasoning |
|-----|-----------|------------|-----------|
[One row per tag. Keep reasoning to 1 short sentence.]

**Vote Suggestion:** [Keep | Remove | Maybe Remove]

**Why:** [1-2 sentences max. Must match your tag analysis.]

**Comment Suggestion:** [5-10 word phrase, e.g. "civil political opinion - no violation"]

**Optional Note:** [1 short sentence the moderator can paste into the "Optional Note" field when submitting their vote. Should directly justify the vote in a neutral, professional tone. IMPORTANT: Use guideline NAMES (e.g. "Be respectful to your neighbors", "Discuss important topics in the right place", "Do not discriminate") — NEVER use internal numbering like "Guideline 1" or "Guideline 3".]
${hasAdditionalContext ? '\n**Moderator Notes:** [Brief response to moderator context]' : ''}

IMPORTANT: Be brief. Your vote MUST match your tag analysis.`;

  // Build user message content — array (with image URLs) or plain string
  const userContent = imageUrls.length > 0
    ? [
        ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
        { type: 'text', text: prompt },
      ]
    : prompt;

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
        content: userContent,
      },
    ],
    temperature: 0.3,
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

  // Detect Anthropic API and adapt request format
  const isAnthropic = CONFIG.apiEndpoint.includes('anthropic.com');

  const headers = {
    'Content-Type': 'application/json',
  };

  let body;
  if (isAnthropic) {
    headers['x-api-key'] = CONFIG.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const systemMsg = requestBody.messages.find(m => m.role === 'system');
    const userMessages = requestBody.messages.filter(m => m.role !== 'system').map(msg => {
      // Convert OpenAI-style image_url blocks to Anthropic-style image source blocks
      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map(block =>
            block.type === 'image_url'
              ? { type: 'image', source: { type: 'url', url: block.image_url.url } }
              : block
          ),
        };
      }
      return msg;
    });
    body = JSON.stringify({
      model: requestBody.model,
      max_tokens: 4096,
      system: systemMsg?.content || '',
      messages: userMessages,
      temperature: requestBody.temperature,
    });
  } else {
    headers['Authorization'] = `Bearer ${CONFIG.apiKey}`;
    body = JSON.stringify(requestBody);
  }

  const response = await fetch(CONFIG.apiEndpoint, {
    method: 'POST',
    headers,
    body,
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
  const content = apiResponse.choices?.[0]?.message?.content || apiResponse.content?.[0]?.text || '';

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
      const { originalPost, flaggedContent, conversationThread, additionalContext, imageUrls } = message.data;

      // Perform analysis with full conversation context, additional context, and images
      const analysis = await analyzeWithLLM(originalPost, flaggedContent, conversationThread, additionalContext, imageUrls || []);

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
