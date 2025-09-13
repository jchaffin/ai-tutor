import { RealtimeAgent, tool } from '@openai/agents/realtime';

// Perform semantic search using embeddings
async function performSemanticSearch(query: string, documentId?: string): Promise<Array<{text: string, similarity: number, page?: number, chunkId?: string, startIndex?: number, endIndex?: number}>> {
  try {
    const response = await fetch('/api/realtime/semantic-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query, 
        documentId,
        sessionId: `agent-${Date.now()}`,
        utteranceId: `agent-utterance-${Date.now()}`
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log("🔍 Semantic search API response:", data);
      return data.results || [];
    } else {
      console.log("🔍 Semantic search API error:", response.status, response.statusText);
    }
  } catch (error) {
    console.log("🔍 Semantic search API error:", error);
  }
  
  return [];
}

export const createTutorAgent = (pdfTitle: string, pdfContent: string, documentId?: string): RealtimeAgent => {
  console.log("🤖 Creating TutorAgent with:", { pdfTitle, pdfContentLength: pdfContent.length });
  console.log("🤖 TutorAgent will introduce itself as AI tutor for:", pdfTitle);
  
  return new RealtimeAgent({
    name: 'ai_tutor',
    instructions: `You are an AI tutor helping a student understand a PDF document titled "${pdfTitle}".

CRITICAL: You MUST respond in ENGLISH ONLY. Never use Spanish or any other language.

CRITICAL INTRODUCTION REQUIREMENT: You MUST introduce yourself immediately when the session starts or when you receive a response.create event. Always begin with: "Hello! I'm your AI tutor. I'm here to help you understand this document, ${pdfTitle}. What would you like to know?"

After your introduction, wait for user questions. If you haven't introduced yourself yet in this session, you MUST do so before answering any questions. 

You are now a HIGHLY INTERACTIVE tutor that automatically highlights and navigates to relevant content as you speak. You MUST:

1. **AUTOMATIC TABLE/FIGURE CIRCLING**: When you mention ANY table or figure, IMMEDIATELY call the appropriate tool:
   - Mention "Table 1" → IMMEDIATELY call circle_table("Table 1") - Uses OCR to detect actual table boundaries
   - Mention "Figure 2" → IMMEDIATELY call circle_figure("Figure 2")
   - This is MANDATORY for every table/figure reference
   - The circle_table tool now uses OCR (Optical Character Recognition) to accurately detect table structure

2. **CONTEXTUAL UI AWARENESS**: As you speak about specific content, continuously highlight the relevant text, tables, figures, or sections you're referencing.

3. **SMART CONTENT DETECTION**: If you mention "baselines", "Table 1", "Figure 2", "Section 5.1", etc., automatically find and highlight that content.

4. **CITATION DETECTION**: If you encounter citations (like "[1]", "[Smith et al., 2023]", or reference numbers), automatically use research_citation to look up the reference.

5. **SPEECH-SYNCHRONIZED HIGHLIGHTING**: The system now automatically detects and highlights content as you speak:
   - When you say "Table 1" → automatically circles Table 1
   - When you say "Figure 2" → automatically circles Figure 2  
   - When you say "[1]" or "[Smith et al., 2023]" → automatically researches citation
   - When you quote text in "quotes" → automatically highlights that text
   - You can still manually call tools, but speech detection provides automatic highlighting

6. **SECTION DETECTION**: For section-related questions, use highlight_section_content to find and highlight entire sections, but time it with your speech flow.

7. **MANDATORY SEMANTIC SEARCH**: You MUST use semantic_search tool during your speech to find conceptually related content. This is REQUIRED, not optional:
   - When explaining concepts → call semantic_search("concept name")
   - When discussing topics → call semantic_search("topic name") 
   - When analyzing content → call semantic_search("analysis terms")
   - Use this tool MULTIPLE TIMES during your response to find related content

Citation and Highlighting Strategy:
- FIRST: Use search_document to find exact keyword matches from the user's query
- THEN: Begin your spoken response with page references
- DURING your speech: Use semantic_search to find conceptually similar content as you explain concepts (MANDATORY)
- DURING your speech: Use highlight_section_ocr to highlight section regions using OCR detection for better accuracy
- AS you mention tables/figures: Use circle_table/circle_figure appropriately
- Always refer to the document explicitly (say the page number)
- Quote short phrases from the PDF that support your statements

Your capabilities:
1. Answer questions about the document content
2. Provide explanations and clarifications  
3. Navigate to specific pages when referencing content
4. Highlight important text synchronized with your speech
5. Engage in natural voice conversation
6. **Time highlights to match your verbal references**

Document content:
${pdfContent}

ENHANCED MULTI-ANNOTATION SYSTEM: You can now make multiple annotations in a single response when necessary:

CORRECTED WORKFLOW: When the user asks about ANY topic:

1. **INITIAL KEYWORD SEARCH**: Use search_document to find exact matches from the user's query
   - This finds content that contains the exact terms the user mentioned
   - This is ONLY for gathering initial information to answer the question
   - Do NOT use this to highlight the user's query terms
   - Use this to find what you'll talk about in your response

2. **RESPONSE PHASE**: Speak naturally about the content you found
   - Reference specific pages, quotes, tables, figures as you explain
   - **ALWAYS circle tables/figures when you mention them in your response**
   - **DURING YOUR SPEECH**: Use semantic_search to find conceptually related content as you explain concepts

3. **MANDATORY TABLE/FIGURE CIRCLING**: When you mention any table or figure in your response:
   - If you say "Table 1" → IMMEDIATELY call circle_table("Table 1")
   - If you say "Figure 2" → IMMEDIATELY call circle_figure("Figure 2")
   - This is REQUIRED, not optional

4. **SPEECH-DRIVEN ANNOTATIONS**: The system automatically annotates as you speak:
   - When you say "Table 1 shows..." → Table 1 gets circled
   - When you quote text → That text gets highlighted  
   - When you mention "[1]" → Citation gets researched
   - **When you explain concepts → Use semantic_search to find related content**
   - All based on YOUR speech content, not the user's query

MULTI-CITATION SUPPORT: When discussing multiple citations, call research_citation for each one mentioned.

CORRECT EXAMPLE: User asks "tell me about the data"

**WRONG APPROACH** (what it was doing):
- Immediately annotate "data" from user query
- Highlight random occurrences of "data"

**CORRECT APPROACH** (what it should do):
1. Use search_document("data") to find exact keyword matches
2. Speak naturally: "The data is presented in Table 1 on page 5, which shows performance metrics..."
3. **DURING SPEECH**: Use semantic_search("performance metrics analysis") to find related content
4. Continue: "As you can see from the results, the MH-SSM model achieves 1.80 WER as reported in Smith et al. 2023..."
5. **Speech system automatically**:
   - Circles "Table 1" when you say it
   - Highlights specific quotes when you quote them 
   - Researches "Smith et al. 2023" when you mention it
   - Finds semantically related content as you explain concepts

SPEECH-DRIVEN ANNOTATION: Only annotate what YOU reference in your response, not what the user asked about.

REMOVED: All automatic annotation instructions. The agent should focus on providing helpful explanations.

SIMPLE WORKFLOW:
1. Use search_document to find exact keyword matches from user query
2. Respond with specific page references and quotes
3. DURING SPEECH: Use semantic_search to find conceptually related content as you explain
4. Always reference and highlight the PDF content you found

Navigation commands:
- If the user says anything like "go to page N", "page N", or "open page N", IMMEDIATELY call navigate_to_page with that page number.
- Accept both digits and number words (e.g., "eight" → 8).

When you want to navigate to a specific page, use the navigate_to_page tool.

When you want to highlight a phrase, prefer search_document so the actual words are highlighted. Only use create_annotation for explicit shapes upon request.

Guidelines:
- Be encouraging and supportive
- Explain concepts clearly and at an appropriate level
- Ask follow-up questions to ensure understanding
- Use analogies and examples when helpful
- Be conversational and natural in your responses
- Always be accurate and cite the document when making claims
- ALWAYS respond with voice output - never be silent
- **CONTINUOUSLY highlight relevant content as you speak about it**


Remember: You're having a voice conversation, so keep responses natural and spoken-friendly rather than overly formal or written-style. You are now a VISUAL tutor that makes the document come alive with real-time highlighting. ALWAYS check if the user is asking about a section first! If unsure, call list_sections to see available sections, then navigate_to_section.`,
    
    tools: [
      // semantic search
      tool({
        name: 'semantic_search',
        description: 'Perform semantic search using embeddings to find conceptually similar content in the document. Use this DURING your speech when explaining concepts to find related content, not for initial user query matching.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The concept or idea to search for semantically (use concepts you are explaining, not user query terms)'
            }
          },
          required: ['query'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          console.log("🔍 SEMANTIC SEARCH TOOL CALLED:", input);
          const { query } = input;
          
          try {
            console.log(`🔍 Performing semantic search for: "${query}" with documentId: ${documentId}`);
            const semanticResults = await performSemanticSearch(query, documentId);
            console.log(`🔍 Semantic search returned ${semanticResults.length} results:`, semanticResults);
            
            if (semanticResults && semanticResults.length > 0) {
              console.log(`🔍 Found ${semanticResults.length} semantic matches for "${query}"`);
              
              // Return results for client-side processing
              return {
                success: true,
                results: semanticResults.map(r => ({
                  text: r.text.substring(0, 200) + (r.text.length > 200 ? '...' : ''),
                  page: r.page,
                  similarity: r.similarity,
                  chunkId: r.chunkId,
                  startIndex: r.startIndex,
                  endIndex: r.endIndex
                })),
                message: `Found ${semanticResults.length} semantically similar content pieces`,
                query: query,
                shouldHighlight: true
              };
            } else {
              console.log(`🔍 No semantic matches found for "${query}"`);
              return {
                success: false,
                results: [],
                message: 'No semantically similar content found'
              };
            }
          } catch (error) {
            console.error("🔍 Semantic search tool error:", error);
            return {
              success: false,
              error: 'Semantic search failed',
              message: 'Unable to perform semantic search'
            };
          }
        }
      }),
      // search document
      tool({
        name: 'search_document',
        description: 'Search for specific terms or concepts in the PDF document',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The term or concept to search for'
            }
          },
          required: ['query'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          console.log("🔍 SEARCH TOOL CALLED:", input);
          console.log("🔍 Window object available:", typeof window !== 'undefined');
          const { query } = input;
          
          // Request the viewer to perform search and return matches
          const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          let results: Array<{ page: number; pageIndex: number; matchIndex: number; startIndex: number; endIndex: number; excerpt: string }>
            = [];

          if (typeof window !== 'undefined') {
            // Clear previous search marks when asking new questions
            // Note: Circles are preserved unless it's a completely new topic
            window.dispatchEvent(new CustomEvent('pdf-clear-highlights'));
            console.log("🔍 Cleared previous highlights for new search (keeping circles)");
            const waitForResults = new Promise<void>((resolve) => {
              const handler = (event: any) => {
                if (event?.detail?.requestId === requestId) {
                  results = event.detail.results || [];
                  window.removeEventListener('pdf-search-results', handler as EventListener);
                  resolve();
                }
              };
              window.addEventListener('pdf-search-results', handler as EventListener, { once: true });
            });

            // Build robust keyword variants prioritizing longer phrases to reduce character fragmentation
            const q = String(query || '').trim();
            const base = q.toLowerCase();
            const variants = new Set<string>();
            
            // Prioritize the original query first (longer phrases highlight better)
            variants.add(base);
            
            // Use semantic search with embeddings for better matching
            try {
              const semanticResults = await performSemanticSearch(query, documentId);
              if (semanticResults && semanticResults.length > 0) {
                // Instead of adding keywords, dispatch semantic highlight events for specific fragments
                semanticResults.forEach(result => {
                  if (result.text && result.text.length > 10) {
                    // Dispatch event to highlight this specific semantically similar fragment
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('tutor-highlight-semantic-fragment', {
                        detail: {
                          text: result.text,
                          page: result.page,
                          similarity: result.similarity,
                          query: query
                        }
                      }));
                    }
                  }
                });
              }
            } catch (error) {
              console.log("🔍 Semantic search failed, falling back to keyword search:", error);
            }
            
            // Only add variations if the original is short (to avoid over-fragmentation)
            if (base.length <= 15) {
              // Handle hyphenated terms
              if (base.includes('-')) {
                variants.add(base.replace(/-/g, ''));
                variants.add(base.replace(/-/g, ' '));
              } else {
                // also add hyphenated
                variants.add(base.replace(/\s+/g, '-'));
              }
            }
            
            // Handle mathematical expressions and equations
            if (/^[a-z]\d*$/i.test(base)) {
              // Single variables like x, y, h1, etc.
              variants.add(base.toUpperCase());
              variants.add(base.toLowerCase());
            }
            
            // Handle common mathematical terms
            if (base.includes('equation') || base.includes('formula')) {
              variants.add('equation');
              variants.add('formula');
              variants.add('expression');
            }
            
            // Handle subscripts and superscripts (common in equations)
            if (base.match(/[a-z]\d+/i)) {
              const letter = base.match(/[a-z]+/i)?.[0] || '';
              const number = base.match(/\d+/)?.[0] || '';
              if (letter && number) {
                variants.add(letter); // Just the letter part
                variants.add(`${letter}_${number}`); // Underscore notation
                variants.add(`${letter}${number}`); // Original
              }
            }
            // Create keyword objects for better phrase matching
            const keywordObjects = Array.from(variants).map((v) => ({ 
              keyword: v, 
              matchCase: false
            }));

            console.log("🔍 Dispatching pdf-search-request event:", { requestId, keywordObjects });
            window.dispatchEvent(new CustomEvent('pdf-search-request', {
              detail: { requestId, keywords: keywordObjects }
            }));
            console.log("🔍 Event dispatched successfully");

            await waitForResults;

            // AUTOMATIC SECTION DETECTION: If this looks like a section title, highlight the entire section
            if (typeof window !== 'undefined' && (window as any).__pdfOutline) {
              const outline: Array<{ title: string; pageIndex: number }> = (window as any).__pdfOutline || [];
              const searchTerm = query.toLowerCase().trim();
              
              // Check if this query matches a section title
              const sectionMatch = outline.find(s => 
                s.title.toLowerCase().includes(searchTerm) ||
                searchTerm.includes(s.title.toLowerCase()) ||
                s.title.toLowerCase() === searchTerm
              );
              
              if (sectionMatch) {
                console.log(`🎯 AUTO-DETECTED SECTION: "${sectionMatch.title}" on page ${sectionMatch.pageIndex + 1}`);
                // Navigate to the section
                try {
                  if ((window as any).pdfJumpToPage) {
                    (window as any).pdfJumpToPage(sectionMatch.pageIndex + 1);
                  } else {
                    window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: sectionMatch.pageIndex } }));
                  }
                } catch {}
                
                // Highlight the entire section by searching for the section title text
                const sectionRequestId = `section-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                window.dispatchEvent(new CustomEvent('pdf-search-request', {
                  detail: { requestId: sectionRequestId, keywords: [{ keyword: sectionMatch.title, matchCase: false }] }
                }));
              }
            }

            // Build per-page first-match steps across ALL relevant pages
            const pageToFirst = new Map<number, { pageIndex: number; matchIndex: number; globalIndex: number }>();
            for (let i = 0; i < results.length; i++) {
              const r: any = results[i];
              const gi = typeof r.globalIndex === 'number' ? r.globalIndex : i;
              if (!pageToFirst.has(r.pageIndex) || gi < (pageToFirst.get(r.pageIndex) as any).globalIndex) {
                pageToFirst.set(r.pageIndex, { pageIndex: r.pageIndex, matchIndex: r.matchIndex, globalIndex: gi });
              }
            }
            const steps = Array.from(pageToFirst.values()).sort((a, b) => a.globalIndex - b.globalIndex);

            // Expose full search state for UI/agent summarization
            (window as any).__pdfSearchState = {
              query,
              results,
              steps,
              currentIndex: 0,
              lastJumpMs: 0,
            };
            window.dispatchEvent(new CustomEvent('pdf-search-state', { detail: { query, results, steps } }));

            // Jump to first relevant page
            if (steps.length > 0) {
              try {
                const first = steps[0];
                if ((window as any).pdfJumpToPage) (window as any).pdfJumpToPage(first.pageIndex + 1);
                else window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: first.pageIndex } }));
              } catch {}

              // Stay on the first relevant page instead of auto-advancing
              // Auto-advance is disabled to keep focus on the current reference
            }
          }

          // Aggregate for summarization and multi-citation
          const pagesSet = new Set<number>();
          const citations: Array<{ page: number; quote: string }> = [];
          for (const r of results) {
            pagesSet.add(r.page);
            const quote = (r.excerpt || '').slice(0, 140);
            if (quote) citations.push({ page: r.page, quote });
          }
          const pages = Array.from(pagesSet).sort((a, b) => a - b);

          return {
            success: true,
            query,
            matches: results,
            pages,
            citations: citations.slice(0, 12),
            message: results.length > 0
              ? `Found ${results.length} matches for "${query}" across pages ${pages.join(', ')}.`
              : `No matches found for "${query}".`
          };
        }
      }),
      // get page count
      tool({
        name: 'get_page_count',
        description: 'Return the total number of pages in the currently open PDF',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        execute: async () => {
          let numPages: number | undefined;
          if (typeof window !== 'undefined') {
            numPages = (window as any).__pdfNumPages;
            if (numPages === undefined) {
              const wait = new Promise<number>((resolve) => {
                const handler = (ev: any) => {
                  window.removeEventListener('pdf-doc-loaded', handler as EventListener);
                  resolve(ev?.detail?.numPages ?? 0);
                };
                window.addEventListener('pdf-doc-loaded', handler as EventListener, { once: true });
              });
              numPages = await wait;
            }
          }
          return { success: true, pages: numPages ?? 0 };
        }
      }),
      // navigate to page
      tool({
        name: 'navigate_to_page',
        description: 'Navigate to a specific page in the PDF document',
        parameters: {
          type: 'object',
          properties: {
            page: {
              type: ['number', 'string'],
              description: 'The page number to navigate to (number or a number word like "eight")'
            },
            reason: {
              type: 'string',
              description: 'Why you are navigating to this page'
            }
          },
          required: ['page'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          console.log("🧭 NAVIGATE TOOL CALLED:", input);
          const { page: rawPage, reason } = input;

          const numberWords: Record<string, number> = {
            one: 1, two: 2, three: 3, four: 4, five: 5,
            six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
            eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
            sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
          };

          let page = typeof rawPage === 'number' ? rawPage : parseInt(String(rawPage).replace(/[^\w\s-]/g, '').match(/\d+/)?.[0] || '', 10);
          if (!page || isNaN(page)) {
            const word = String(rawPage).toLowerCase().trim();
            page = numberWords[word] ?? 1;
          }

          if (typeof window !== 'undefined') {
            try {
              if ((window as any).pdfJumpToPage) {
                (window as any).pdfJumpToPage(page);
          } else {
                const zeroBased = Math.max(0, (page || 1) - 1);
                window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: zeroBased } }));
              }
            } catch {}
          }
          
          return { 
            success: true, 
            page, 
            reason,
            message: `Navigated to page ${page}${reason ? `: ${reason}` : ''}` 
          };
        }
      }),
      // list sections
      tool({
        name: 'list_sections',
        description: 'Return the list of detected document sections (title and page) from the viewer',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        execute: async () => {
          if (typeof window !== 'undefined') {
            const outline = (window as any).__pdfOutline || [];
            return { success: true, sections: outline.map((s: any) => ({ title: s.title, page: s.pageIndex + 1 })) };
          }
          return { success: false, sections: [] };
        }
      }),
      // navigate to section
      tool({
        name: 'navigate_to_section',
        description: 'Navigate to a section by number (e.g., 5.1) or title (e.g., Baselines). Also highlights the section title.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Section number or title' } },
          required: ['query'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          const qRaw = String(input?.query || '').trim();
          if (!qRaw) return { success: false, message: 'Missing section query' };
          if (typeof window === 'undefined') return { success: false, message: 'Not in browser context' };
          const outline: Array<{ title: string; pageIndex: number }> = (window as any).__pdfOutline || [];
          const q = qRaw.toLowerCase();
          const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
          const numLike = q.match(/^\d+(?:\.\d+)*$/);
          let match = null as any;
          if (numLike) {
            match = outline.find((s) => normalize(s.title).startsWith(q));
          }
          if (!match) {
            match = outline.find((s) => normalize(s.title).includes(q) || q.includes(normalize(s.title)));
          }
          if (match) {
            try { (window as any).pdfJumpToPage ? (window as any).pdfJumpToPage(match.pageIndex + 1) : window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: match.pageIndex } })); } catch {}
            const requestId = `section-nav-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            window.dispatchEvent(new CustomEvent('pdf-search-request', { detail: { requestId, keywords: [{ keyword: match.title, matchCase: false }] } }));
            return { success: true, page: match.pageIndex + 1, section: match.title };
          }
          // fallback: search for the query text directly
          const requestId = `section-fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          window.dispatchEvent(new CustomEvent('pdf-search-request', { detail: { requestId, keywords: [{ keyword: qRaw, matchCase: false }] } }));
          return { success: false, message: 'Section not found in outline; highlighted search results instead.' };
        }
      }),      
      // highlight quote
      tool({
        name: 'highlight_quote',
        description: 'Highlight an exact quote from the document that you are referencing in your response',
        parameters: {
          type: 'object',
          properties: {
            quote: {
              type: 'string',
              description: 'The exact text from the document to highlight (must match exactly)'
            },
            page: {
              type: 'number',
              description: 'The page number where this quote appears'
            }
          },
          required: ['quote'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          const { quote, page } = input;
          if (!quote || typeof quote !== 'string') {
            return { success: false, message: 'Missing or invalid quote text' };
          }
          
          if (typeof window !== 'undefined') {
            const normalized = quote.replace(/\s+/g, ' ').trim();
            if (normalized.length >= 8) {
              // Add a small delay to better sync with speech timing
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('tutor-highlight-quote', {
                  detail: { text: normalized, page }
                }));
              }, 500); // 500ms delay to sync better with speech
              
              return { success: true, quote: normalized, page, message: `Will highlight quote: "${normalized.substring(0, 50)}..." in 500ms` };
            }
          }
          return { success: false, message: 'Quote too short or not in browser context' };
        }
      }),
      // circle table
      tool({
        name: 'circle_table',
        description: 'Circle a table using OCR (Optical Character Recognition) to detect actual visual table boundaries. This tool analyzes the PDF page as an image to find precise table structure, not just text patterns.',
        parameters: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'The table label to circle, e.g., "Table 1"' }
          },
          required: ['label'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          const label = String(input?.label || '').trim();
          if (!label) {
            return { success: false, message: 'Missing table label' };
          }
          if (typeof window !== 'undefined') {
            // Add delay to sync with speech timing
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('tutor-circle-table', { detail: { label } }));
            }, 300); // 300ms delay for table references
            return { success: true, label, message: `Will circle ${label} using OCR visual analysis in 300ms` };
          }
          return { success: false, label, message: 'Not in browser context' };
        }
      }),
      // circle figure
      tool({
        name: 'circle_figure',
        description: 'Circle a figure label by searching for its caption (e.g., "Figure 2") and drawing a circle overlay around it',
        parameters: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'The figure label to circle, e.g., "Figure 2"' }
          },
          required: ['label'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          const label = String(input?.label || '').trim();
          if (!label) return { success: false, message: 'Missing figure label' };
          if (typeof window !== 'undefined') {
            // Add delay to sync with speech timing
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('tutor-circle-figure', { detail: { label } }));
            }, 300); // 300ms delay for figure references
            return { success: true, label, message: `Will circle ${label} in 300ms` };
          }
          return { success: false, label, message: 'Not in browser context' };
        }
      }),
      // create annotation
      tool({
        name: 'create_annotation',
        description: 'Create a visual annotation on the PDF',
        parameters: {
          type: 'object',
          properties: {
            page: {
              type: 'number',
              description: 'The page number for the annotation'
            },
            x: {
              type: 'number',
              description: 'X coordinate as percentage (0-100)'
            },
            y: {
              type: 'number',
              description: 'Y coordinate as percentage (0-100)'
            },
            width: {
              type: 'number',
              description: 'Width as percentage (0-100)'
            },
            height: {
              type: 'number',
              description: 'Height as percentage (0-100)'
            },
            type: {
              type: 'string',
              enum: ['highlight', 'circle', 'rectangle'],
              description: 'Type of annotation'
            },
            color: {
              type: 'string',
              description: 'Color in hex format (e.g., #ffff00)'
            },
            text: {
              type: 'string',
              description: 'Optional text description for the annotation'
            }
          },
          required: ['page', 'x', 'y', 'width', 'height', 'type'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          console.log("📝 ANNOTATION TOOL CALLED:", input);
          const { page, x, y, width, height, type, color = '#ffff00', text } = input;
          
          const annotation = {
            id: Date.now().toString(),
            page,
            x,
            y,
            width,
            height,
            type,
            color,
            text
          };
          
          console.log("📝 Creating annotation:", annotation);
          
          // Dispatch custom event for UI to handle annotation creation
          if (typeof window !== 'undefined') {
            console.log("📝 Dispatching annotation event");
            window.dispatchEvent(new CustomEvent('tutor-annotation-created', {
              detail: { annotation }
            }));

            // If a quote string is provided, try to highlight the exact reference text
            if (text && typeof text === 'string') {
              const normalized = text.replace(/\s+/g, ' ').trim();
              if (normalized.length >= 8) {
                window.dispatchEvent(new CustomEvent('tutor-highlight-quote', {
                  detail: { text: normalized, page }
                }));
              }
            }
          }
          
          return { 
            success: true, 
            annotation,
            message: `Created ${type} annotation on page ${page}${text ? `: ${text}` : ''}` 
          };
        }
      }),      
      // research citation
      tool({
        name: 'research_citation',
        description: 'Research a citation mentioned in the document by dispatching a research agent to look up the paper/reference',
        parameters: {
          type: 'object',
          properties: {
            citation: {
              type: 'string',
              description: 'The citation text or reference number (e.g., "[1]", "[Smith et al., 2023]", "Johnson 2022")'
            },
            context: {
              type: 'string',
              description: 'The context in which the citation was mentioned for better research'
            }
          },
          required: ['citation'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          const { citation, context } = input;
          console.log("📚 CITATION RESEARCH TOOL CALLED:", { citation, context });
          
          if (!citation || typeof citation !== 'string') {
            return { success: false, message: 'Invalid citation provided' };
          }

          if (typeof window !== 'undefined') {
            // Dispatch event to trigger citation research
            const researchRequestId = `citation-research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            
            console.log("📚 Dispatching citation research request:", { citation, context, researchRequestId });
            
            window.dispatchEvent(new CustomEvent('tutor-citation-research', {
              detail: { 
                citation: citation.trim(),
                context: context || '',
                requestId: researchRequestId
              }
            }));
            
            return {
              success: true,
              citation,
              message: `Researching citation: ${citation}`
            };
          }
          
          return { success: false, message: 'Citation research not available in current context' };
        }
      }),      
    ]
  });
};