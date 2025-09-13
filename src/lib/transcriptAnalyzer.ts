/**
 * Transcript Content Analyzer
 * 
 * Analyzes transcript text from the tutor agent to extract content references
 * and trigger appropriate PDF highlighting actions.
 */

export interface ContentReference {
  type: 'table' | 'figure' | 'quote' | 'section' | 'page' | 'citation';
  value: string;
  confidence: number;
  position?: number; // Position in the text where this reference was found
}

export interface AnalysisResult {
  references: ContentReference[];
  hasNewContent: boolean;
  processedText: string;
}

export class TranscriptAnalyzer {
  private lastProcessedText = '';
  private referenceCache = new Map<string, ContentReference[]>();
  
  /**
   * Analyze transcript text for content references
   */
  analyze(text: string): AnalysisResult {
    if (!text || text.trim().length === 0) {
      return { references: [], hasNewContent: false, processedText: text };
    }

    // Check if this is new content (not just a continuation of previous text)
    const hasNewContent = this.hasNewContent(text);
    
    // Extract all content references
    const references = this.extractReferences(text);
    
    // Update cache
    this.lastProcessedText = text;
    this.referenceCache.set(text, references);
    
    return {
      references,
      hasNewContent,
      processedText: text
    };
  }

  /**
   * Check if the text contains new content not seen before
   */
  private hasNewContent(text: string): boolean {
    if (!this.lastProcessedText) return true;
    
    // Always process if text is longer (tutor is still speaking)
    if (text.length > this.lastProcessedText.length) {
      return true;
    }
    
    // Also process if text is significantly different (even if shorter)
    const similarity = this.calculateSimilarity(text, this.lastProcessedText);
    return similarity < 0.8; // Process if less than 80% similar
  }
  
  /**
   * Calculate simple text similarity
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return commonWords.length / totalWords;
  }

  /**
   * Extract content references from text
   */
  private extractReferences(text: string): ContentReference[] {
    const references: ContentReference[] = [];
    
    // Table references
    references.push(...this.extractTableReferences(text));
    
    // Figure references
    references.push(...this.extractFigureReferences(text));
    
    // Quote references (text in quotes)
    references.push(...this.extractQuoteReferences(text));
    
    // Section references
    references.push(...this.extractSectionReferences(text));
    
    // Page references
    references.push(...this.extractPageReferences(text));
    
    // Citation references
    references.push(...this.extractCitationReferences(text));
    
    return references;
  }

  /**
   * Extract table references like "Table 1", "table 2", etc.
   */
  private extractTableReferences(text: string): ContentReference[] {
    const references: ContentReference[] = [];
    const tableRegex = /\b(table\s+\d+)\b/gi;
    let match;
    
    while ((match = tableRegex.exec(text)) !== null) {
      references.push({
        type: 'table',
        value: match[1],
        confidence: 0.9,
        position: match.index
      });
    }
    
    return references;
  }

  /**
   * Extract figure references like "Figure 1", "fig. 2", etc.
   */
  private extractFigureReferences(text: string): ContentReference[] {
    const references: ContentReference[] = [];
    const figureRegex = /\b(figure\s+\d+|fig\.?\s*\d+)\b/gi;
    let match;
    
    while ((match = figureRegex.exec(text)) !== null) {
      references.push({
        type: 'figure',
        value: match[1],
        confidence: 0.9,
        position: match.index
      });
    }
    
    return references;
  }

  /**
   * Extract quoted text references
   */
  private extractQuoteReferences(text: string): ContentReference[] {
    const references: ContentReference[] = [];
    const quoteRegex = /"([^"]{10,100})"/g;
    let match;
    
    while ((match = quoteRegex.exec(text)) !== null) {
      references.push({
        type: 'quote',
        value: match[1],
        confidence: 0.8,
        position: match.index
      });
    }
    
    return references;
  }

  /**
   * Extract section references like "Section 3.1", "subsection 2", etc.
   */
  private extractSectionReferences(text: string): ContentReference[] {
    const references: ContentReference[] = [];
    
    // Only detect actual section numbers, not text concepts
    const sectionRegex = /\b(section\s+\d+(?:\.\d+)*|subsection\s+\d+(?:\.\d+)*)\b/gi;
    let match;
    
    while ((match = sectionRegex.exec(text)) !== null) {
      references.push({
        type: 'section',
        value: match[1],
        confidence: 0.7,
        position: match.index
      });
    }
    
    // REMOVED: Technical concepts like "inter-head gating" should NOT trigger OCR circles
    // They should be handled by semantic highlighting instead
    
    return references;
  }

  /**
   * Extract page references like "page 5", "on page 10", etc.
   */
  private extractPageReferences(text: string): ContentReference[] {
    const references: ContentReference[] = [];
    const pageRegex = /\b(?:on\s+)?(?:page\s+)?(\d+)\b/gi;
    let match;
    
    while ((match = pageRegex.exec(text)) !== null) {
      const pageNum = parseInt(match[1], 10);
      // Only consider reasonable page numbers (1-1000)
      if (pageNum >= 1 && pageNum <= 1000) {
        references.push({
          type: 'page',
          value: match[1],
          confidence: 0.6,
          position: match.index
        });
      }
    }
    
    return references;
  }

  /**
   * Extract citation references like "[1]", "[Smith et al., 2023]", etc.
   */
  private extractCitationReferences(text: string): ContentReference[] {
    const references: ContentReference[] = [];
    const citationRegex = /\[([^\]]+)\]/g;
    let match;
    
    while ((match = citationRegex.exec(text)) !== null) {
      const citation = match[1];
      // Check if it looks like a citation (number or author-year format)
      if (/^\d+$/.test(citation) || /^[A-Za-z\s,]+,\s*\d{4}/.test(citation)) {
        references.push({
          type: 'citation',
          value: citation,
          confidence: 0.8,
          position: match.index
        });
      }
    }
    
    return references;
  }


  /**
   * Get the most recent references from the last analysis
   */
  getLastReferences(): ContentReference[] {
    return this.referenceCache.get(this.lastProcessedText) || [];
  }

  /**
   * Clear the analyzer state
   */
  clear(): void {
    this.lastProcessedText = '';
    this.referenceCache.clear();
  }
}

// Singleton instance for global use
export const transcriptAnalyzer = new TranscriptAnalyzer();
