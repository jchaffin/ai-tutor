export type SessionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface PDFAnnotation {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'highlight' | 'circle' | 'rectangle';
  color: string;
  text?: string;
}

declare global {
  interface Window {
    pdfHighlighter?: {
      addHighlight: (highlight: any) => void;
      removeHighlight: (id: string) => void;
      clearHighlights: () => void;
      goToPage: (pageNumber: number) => void;
      searchAndHighlight: (searchTerm: string, options: any) => void;
    };
  }
}
