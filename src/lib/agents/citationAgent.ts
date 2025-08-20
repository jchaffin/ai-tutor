import { RealtimeAgent, tool } from '@openai/agents/realtime';

export const createCitationResearchAgent = (): RealtimeAgent => {
  console.log("📚 Creating Citation Research Agent");
  
  return new RealtimeAgent({
    name: 'citation_researcher',
    instructions: `You are a specialized citation research agent. Your job is to research academic citations and provide detailed information about referenced papers.

When you receive a citation to research, you should:

1. **IDENTIFY** the citation format (numbered reference like [1], author-year like "Smith 2023", or full citation)
2. **EXTRACT** key information like authors, title, year, venue
3. **PROVIDE** a comprehensive summary including:
   - Full citation details (authors, title, journal/conference, year)
   - Brief abstract or summary of the paper's main contributions
   - Relevance to the current document's topic
   - Key findings or methodologies mentioned

4. **RESPOND** in a clear, informative manner that helps the user understand:
   - What the cited paper is about
   - Why it was cited in this context
   - How it relates to the current document

If you cannot find specific information about a citation, explain what you can determine from the citation format and suggest how the user might find more information.

Always be thorough but concise, focusing on information that would be most helpful for understanding the cited work's relevance.`,
    
    tools: [
      tool({
        name: 'web_search_citation',
        description: 'Search the web for information about a specific citation or academic paper',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to find information about the citation'
            },
            citation: {
              type: 'string', 
              description: 'The original citation text for context'
            }
          },
          required: ['query', 'citation'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          const { query, citation } = input;
          console.log("🔍 Citation web search:", { query, citation });
          
          // In a real implementation, this would call a web search API
          // For now, return a placeholder response
          return {
            success: true,
            query,
            citation,
            results: [
              {
                title: `Research results for: ${citation}`,
                snippet: `This is a placeholder for web search results about the citation: ${citation}. In a real implementation, this would search academic databases, Google Scholar, or other sources to find information about the referenced paper.`,
                url: "https://scholar.google.com"
              }
            ],
            message: `Found information about citation: ${citation}`
          };
        }
      }),

      tool({
        name: 'extract_citation_info',
        description: 'Extract structured information from a citation string',
        parameters: {
          type: 'object',
          properties: {
            citation: {
              type: 'string',
              description: 'The citation text to analyze'
            }
          },
          required: ['citation'],
          additionalProperties: false
        },
        execute: async (input: any) => {
          const { citation } = input;
          console.log("📋 Extracting citation info:", citation);
          
          const citationInfo: any = {
            original: citation,
            type: 'unknown',
            authors: [],
            title: '',
            year: '',
            venue: ''
          };

          // Simple citation parsing logic
          if (citation.match(/^\[\d+\]$/)) {
            citationInfo.type = 'numbered';
            citationInfo.number = citation.replace(/[\[\]]/g, '');
          } else if (citation.match(/\w+\s+et\s+al\.?,?\s+\d{4}/i)) {
            citationInfo.type = 'author-year';
            const match = citation.match(/(\w+)\s+et\s+al\.?,?\s+(\d{4})/i);
            if (match) {
              citationInfo.authors = [match[1] + ' et al.'];
              citationInfo.year = match[2];
            }
          } else if (citation.match(/\w+,?\s+\d{4}/)) {
            citationInfo.type = 'author-year';
            const match = citation.match(/(\w+),?\s+(\d{4})/);
            if (match) {
              citationInfo.authors = [match[1]];
              citationInfo.year = match[2];
            }
          }

          return {
            success: true,
            citation,
            info: citationInfo,
            message: `Extracted information from citation: ${citation}`
          };
        }
      })
    ]
  });
};
