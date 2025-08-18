import { RealtimeAgent, tool } from '@openai/agents/realtime';

export const createTutorAgent = (pdfTitle: string, pdfContent: string): RealtimeAgent => {
  return new RealtimeAgent({
    name: 'ai_tutor',
    instructions: `You are an AI tutor helping a student understand a PDF document titled "${pdfTitle}".

Your capabilities:
1. Answer questions about the document content
2. Provide explanations and clarifications
3. Navigate to specific pages when referencing content
4. Highlight important text by creating visual annotations
5. Engage in natural voice conversation

Document content:
${pdfContent}

When you want to navigate to a specific page, use the navigate_to_page tool.

When you want to highlight or annotate something, use the create_annotation tool to create visual annotations on the PDF.

Guidelines:
- Be encouraging and supportive
- Explain concepts clearly and at an appropriate level
- Ask follow-up questions to ensure understanding
- Use analogies and examples when helpful
- Be conversational and natural in your responses
- Always be accurate and cite the document when making claims

Remember: You're having a voice conversation, so keep responses natural and spoken-friendly rather than overly formal or written-style.`,
    
    tools: [
      tool({
        name: 'navigate_to_page',
        description: 'Navigate to a specific page in the PDF document',
        parameters: {
          type: 'object',
          properties: {
            page: {
              type: 'number',
              description: 'The page number to navigate to'
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
          const { page, reason } = input;
          
          // Dispatch custom event for UI to handle page navigation
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tutor-page-navigation', {
              detail: { page, reason }
            }));
          }
          
          return { 
            success: true, 
            page, 
            reason,
            message: `Navigated to page ${page}${reason ? `: ${reason}` : ''}` 
          };
        }
      }),

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
          
          // Dispatch custom event for UI to handle annotation creation
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tutor-annotation-created', {
              detail: { annotation }
            }));
          }
          
          return { 
            success: true, 
            annotation,
            message: `Created ${type} annotation on page ${page}${text ? `: ${text}` : ''}` 
          };
        }
      })
    ]
  });
};