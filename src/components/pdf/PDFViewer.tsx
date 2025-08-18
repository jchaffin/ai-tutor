"use client";

import React, { useState, useEffect, useRef } from "react";
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { searchPlugin, SingleKeyword, Match } from '@react-pdf-viewer/search';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';

// Import styles
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/search/lib/styles/index.css';

interface PDFViewerProps {
  fileUrl: string
  onPageChange?: (page: number) => void
  currentPage?: number
}

const PDFViewer: React.FC<PDFViewerProps> = ({
  fileUrl,
  onPageChange,
  currentPage = 1
}) => {
  const [isDocLoaded, setIsDocLoaded] = useState(false);
  const pendingNavRef = useRef<number | null>(null);
  const lastKeywordsRef = useRef<SingleKeyword | SingleKeyword[] | undefined>(undefined);

  const scrollToPageIndex = (zeroBasedIndex: number, attempts: number = 10) => {
    if (attempts <= 0) return;
    try {
      // react-pdf-viewer sets data-testid="core__page-layer-{pageIndex}" where pageIndex is zero-based
      const selectorByTestId = `[data-testid="core__page-layer-${zeroBasedIndex}"]`;
      const el = document.querySelector(selectorByTestId) as HTMLElement | null;
      const container = document.querySelector('[data-testid="core__inner-pages"]') as HTMLElement | null;
      if (el) {
        if (container && typeof (container as any).scrollTo === 'function') {
          const contRect = container.getBoundingClientRect();
          const pageRect = el.getBoundingClientRect();
          const delta = (pageRect.top - contRect.top) + container.scrollTop;
          const targetTop = Math.max(0, delta - (container.clientHeight / 2) + (pageRect.height / 2));
          try {
            container.scrollTo({ top: targetTop, behavior: 'smooth' });
          } catch {
            container.scrollTop = targetTop;
          }
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      // Fallback to any future attribute we may support
      const fallback = document.querySelector(`[data-page-number="${zeroBasedIndex + 1}"]`) as HTMLElement | null;
      if (fallback) {
        if (container && typeof (container as any).scrollTo === 'function') {
          const contRect = container.getBoundingClientRect();
          const pageRect = fallback.getBoundingClientRect();
          const delta = (pageRect.top - contRect.top) + container.scrollTop;
          const targetTop = Math.max(0, delta - (container.clientHeight / 2) + (pageRect.height / 2));
          try {
            container.scrollTo({ top: targetTop, behavior: 'smooth' });
          } catch {
            container.scrollTop = targetTop;
          }
        } else {
          fallback.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
    } catch {}
    setTimeout(() => scrollToPageIndex(zeroBasedIndex, attempts - 1), 150);
  };

  // Expose highlight API to global window for agent access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.pdfHighlighter = {
        addHighlight: (highlight: any) => {
          console.log("🎯 PDF API: Adding highlight:", highlight);
          // This function is no longer used as we removed custom highlighting
        },
        removeHighlight: (id: string) => {
          console.log("🎯 PDF API: Removing highlight:", id);
          // This function is no longer used as we removed custom highlighting
        },
        clearHighlights: () => {
          console.log("🎯 PDF API: Clearing all highlights");
          // This function is no longer used as we removed custom highlighting
        },
        goToPage: (pageNumber: number) => {
          console.log("🎯 PDF API: Going to page:", pageNumber);
          if (onPageChange) {
            onPageChange(pageNumber);
          }
        },
        searchAndHighlight: (searchTerm: string, options: any) => {
          console.log("🎯 PDF API: Searching for text:", searchTerm);
          // This will use react-pdf-viewer's built-in search functionality
          // For now, create a simple highlight at estimated positions
          const fakeResults = [{
            text: searchTerm,
            highlightAreas: [{
              pageIndex: 0, // First page for demo
              left: 20,
              top: 30,
              width: searchTerm.length * 0.8,
              height: 3
            }]
          }];
          
          if (options.onSearchComplete) {
            options.onSearchComplete(fakeResults);
          }
        }
      };
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete window.pdfHighlighter;
      }
    };
  }, [onPageChange]);

  // Listen for direct highlight events from agent (fallback)
  useEffect(() => {
    const handleNavigatePage = (event: any) => {
      console.log("🧭 PDF: Received navigate page event:", event.detail);
      const zeroBased = event.detail.pageNumber;
      if (!isDocLoaded) {
        pendingNavRef.current = zeroBased;
        // Also store globally in case this component remounts
        (window as any).__pendingPdfNav = zeroBased;
        return;
      }
      try {
        pageNavigationPluginInstance.jumpToPage(zeroBased);
        scrollToPageIndex(zeroBased);
      } catch (e) {
        if (onPageChange) {
          onPageChange(zeroBased + 1);
        }
        scrollToPageIndex(zeroBased);
      }
    };

    window.addEventListener('pdf-navigate-page', handleNavigatePage);

    return () => {
      window.removeEventListener('pdf-navigate-page', handleNavigatePage);
    };
  }, [onPageChange]);

  // Convert annotations to react-pdf-viewer highlights
  useEffect(() => {
    // This useEffect is no longer needed as we removed custom highlighting
  }, []);

  // REMOVED: Custom highlight render functions that were creating random boxes
  // We now only use searchPlugin's native text highlighting

  // Create plugins (stable instance)
  const searchPluginInstanceRef = useRef(searchPlugin({ 
    enableShortcuts: true,
    keyword: ''
  }));
  const searchPluginInstance = searchPluginInstanceRef.current;
  const pageNavigationPluginInstanceRef = useRef(pageNavigationPlugin());
  const pageNavigationPluginInstance = pageNavigationPluginInstanceRef.current;
  
  // REMOVED: highlightPlugin that was creating random boxes
  // Only use searchPlugin's native highlighting for actual text content

  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[0], // Thumbnails
      defaultTabs[1], // Bookmarks
    ],
  });

  // Expose a stable global jump function for external callers (agent/session)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const api: any = window as any;
    api.pdfJumpToPage = (oneBasedPage: number) => {
      const zeroBased = Math.max(0, (oneBasedPage || 1) - 1);
      if (!isDocLoaded) {
        pendingNavRef.current = zeroBased;
        api.__pendingPdfNav = zeroBased;
        return;
      }
      try {
        pageNavigationPluginInstance.jumpToPage(zeroBased);
      } catch {}
      scrollToPageIndex(zeroBased);
    };
    return () => {
      try { delete (window as any).pdfJumpToPage; } catch {}
    };
  }, [isDocLoaded, pageNavigationPluginInstance]);

  // Listen for search-related events from the agent/UI
  useEffect(() => {
    const handleSearchRequest = async (event: any) => {
      const requestId = event?.detail?.requestId;
      const reqKeywords = event?.detail?.keywords as SingleKeyword | SingleKeyword[];
      console.log("🔍 PDF: Search request received:", { requestId, keywords: reqKeywords });
      
      if (!reqKeywords) {
        console.warn("🔍 PDF: No keywords provided for search");
        return;
      }
      
      lastKeywordsRef.current = reqKeywords;
      try {
        console.log("🔍 PDF: Clearing previous highlights...");
        // Ensure old marks are removed before applying new ones
        try { 
          searchPluginInstanceRef.current.clearHighlights(); 
          console.log("🔍 PDF: Previous highlights cleared");
        } catch (err) {
          console.warn("🔍 PDF: Failed to clear highlights:", err);
        }
        
        console.log("🔍 PDF: Applying new highlights for:", reqKeywords);
        const matches: Match[] = await searchPluginInstanceRef.current.highlight(reqKeywords as any);
        console.log("🔍 PDF: Search results:", matches);
        
        const results = matches.map((m, i) => {
          const text = m.pageText || '';
          const contextStart = Math.max(0, m.startIndex - 80);
          const contextEnd = Math.min(text.length, m.endIndex + 80);
          const excerpt = text.slice(contextStart, contextEnd);
          return {
            pageIndex: m.pageIndex,
            page: m.pageIndex + 1,
            matchIndex: m.matchIndex,
            globalIndex: i,
            startIndex: m.startIndex,
            endIndex: m.endIndex,
            excerpt,
          };
        });
        
        console.log("🔍 PDF: Processed results:", results);
        window.dispatchEvent(new CustomEvent('pdf-search-results', {
          detail: { requestId, results }
        }));
      } catch (err) {
        console.error('🔍 PDF: Search request failed', err);
        window.dispatchEvent(new CustomEvent('pdf-search-results', {
          detail: { requestId, results: [] }
        }));
      }
    };

    const handleSetKeywords = async (event: any) => {
      const newKeywords = event?.detail?.keywords as SingleKeyword | SingleKeyword[];
      console.log("🔍 PDF: Setting keywords:", newKeywords);
      lastKeywordsRef.current = newKeywords;
      
      // Also apply highlighting immediately when keywords are set
      if (newKeywords) {
        try {
          console.log("🔍 PDF: Applying keywords for highlighting:", newKeywords);
          await searchPluginInstanceRef.current.highlight(newKeywords as any);
          console.log("🔍 PDF: Keywords applied successfully");
        } catch (err) {
          console.error("🔍 PDF: Failed to apply keywords:", err);
        }
      }
    };

    const handleJumpTo = (event: any) => {
      const index = typeof event?.detail?.index === 'number' ? event.detail.index : 0;
      let attempts = 0;
      const tryJump = async () => {
        try {
          const result = searchPluginInstanceRef.current.jumpToMatch(index);
          if (!result && attempts < 5) {
            attempts += 1;
            // Re-apply highlights if needed, then retry
            const kw = lastKeywordsRef.current;
            if (kw) {
              try { await searchPluginInstanceRef.current.highlight(kw as any); } catch {}
            }
            setTimeout(tryJump, 150);
          }
        } catch (e) {
          if (attempts < 5) {
            attempts += 1;
            const kw = lastKeywordsRef.current;
            if (kw) {
              try { await searchPluginInstanceRef.current.highlight(kw as any); } catch {}
            }
            setTimeout(tryJump, 150);
          }
        }
      };
      tryJump();
    };

    const handleClearHighlights = () => {
      try { searchPluginInstanceRef.current.clearHighlights(); } catch {}
    };

    window.addEventListener('pdf-search-request', handleSearchRequest);
    window.addEventListener('pdf-set-keywords', handleSetKeywords);
    window.addEventListener('pdf-jump-to', handleJumpTo);
    window.addEventListener('pdf-clear-highlights', handleClearHighlights);

    return () => {
      window.removeEventListener('pdf-search-request', handleSearchRequest);
      window.removeEventListener('pdf-set-keywords', handleSetKeywords);
      window.removeEventListener('pdf-jump-to', handleJumpTo);
      window.removeEventListener('pdf-clear-highlights', handleClearHighlights);
    };
  }, []);

  // React to keyword changes (only clear when empty; highlighting is driven by explicit requests)
  useEffect(() => {
    const hasNoKeywords =
      lastKeywordsRef.current === undefined ||
      (Array.isArray(lastKeywordsRef.current) && lastKeywordsRef.current.length === 0) ||
      (typeof lastKeywordsRef.current === 'string' && lastKeywordsRef.current.trim() === '');

    if (hasNoKeywords) {
      try {
        searchPluginInstanceRef.current.clearHighlights();
      } catch {}
    }
  }, [lastKeywordsRef.current]);

  return (
    <div className="w-full h-full">
      {/* Test button for debugging highlighting */}
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000 }}>
        <button 
          onClick={() => {
            console.log("🧪 Testing search highlighting...");
            if (searchPluginInstanceRef.current) {
              try {
                searchPluginInstanceRef.current.highlight('test');
                console.log("🧪 Test highlight applied");
              } catch (err) {
                console.error("🧪 Test highlight failed:", err);
              }
            }
          }}
          style={{
            background: 'red',
            color: 'white',
            border: 'none',
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test Highlight
        </button>
      </div>
      
      <Worker workerUrl="/pdf.worker.js">
        <div style={{ height: '100vh' }}>
          <Viewer
            fileUrl={fileUrl}
            plugins={[defaultLayoutPluginInstance, pageNavigationPluginInstance, searchPluginInstance]}
            onDocumentLoad={(e) => {
              setIsDocLoaded(true);
              try {
                (window as any).__pdfNumPages = e?.doc?.numPages ?? undefined;
                window.dispatchEvent(new CustomEvent('pdf-doc-loaded', { detail: { numPages: e?.doc?.numPages } }));
              } catch {}
              // Signal readiness for external controllers
              try {
                (window as any).__pdfReady = true;
                window.dispatchEvent(new CustomEvent('pdf-ready'));
              } catch {}
              // Extract outline (sections) and expose globally
              (async () => {
                try {
                  console.log("🔍 PDF: Attempting to extract outline...");
                  
                  // Try multiple methods to get the outline
                  let outline: any[] = [];
                  
                  // Method 1: Try getOutline()
                  try {
                    outline = await (e as any)?.doc?.getOutline?.();
                    console.log("🔍 PDF: getOutline() result:", outline);
                  } catch (err) {
                    console.log("🔍 PDF: getOutline() failed:", err);
                  }
                  
                  // Method 2: Try bookmarks if outline failed
                  if (!outline || outline.length === 0) {
                    try {
                      outline = await (e as any)?.doc?.getBookmarks?.();
                      console.log("🔍 PDF: getBookmarks() result:", outline);
                    } catch (err) {
                      console.log("🔍 PDF: getBookmarks() failed:", err);
                    }
                  }
                  
                  // Method 3: Try to extract from document info
                  if (!outline || outline.length === 0) {
                    try {
                      const info = await (e as any)?.doc?.getMetadata?.();
                      console.log("🔍 PDF: Document metadata:", info);
                    } catch (err) {
                      console.log("🔍 PDF: getMetadata() failed:", err);
                    }
                  }
                  
                  const flat: Array<{ title: string; pageIndex: number }> = [];
                  if (Array.isArray(outline) && outline.length > 0) {
                    const walk = async (items: any[]) => {
                      for (const it of items) {
                        let pageIndex: number | null = null;
                        const dest = it?.dest;
                        if (Array.isArray(dest) && dest[0]) {
                          try { pageIndex = await (e as any).doc.getPageIndex(dest[0]); } catch {}
                        }
                        if (typeof pageIndex === 'number') {
                          flat.push({ title: String(it.title || '').trim(), pageIndex });
                        }
                        if (Array.isArray(it.items) && it.items.length) {
                          await walk(it.items);
                        }
                      }
                    };
                    await walk(outline);
                  }
                  
                  console.log("🔍 PDF: Final extracted sections:", flat);
                  (window as any).__pdfOutline = flat;
                  window.dispatchEvent(new CustomEvent('pdf-outline', { detail: { sections: flat } }));
                  
                  // Also try to extract section-like content from page text
                  if (flat.length === 0) {
                    console.log("🔍 PDF: No outline found, attempting to extract sections from page text...");
                    try {
                      const numPages = e?.doc?.numPages || 0;
                      const textSections: Array<{ title: string; pageIndex: number }> = [];
                      
                      // Check first few pages for section headers
                      for (let i = 0; i < Math.min(numPages, 10); i++) {
                        try {
                          const page = await (e as any).doc.getPage(i + 1);
                          const textContent = await page.getTextContent();
                          const text = textContent.items.map((item: any) => item.str).join(' ');
                          
                          // Look for section patterns like "3.1", "Section 4", etc.
                          const sectionMatches = text.match(/(?:Section\s+)?(\d+(?:\.\d+)*)\s*[A-Z][^.]*\.?/g);
                          if (sectionMatches) {
                            sectionMatches.forEach((match: string) => {
                              const cleanMatch = match.replace(/^Section\s+/i, '').trim();
                              if (cleanMatch) {
                                textSections.push({ title: cleanMatch, pageIndex: i });
                              }
                            });
                          }
                        } catch (err) {
                          console.log(`🔍 PDF: Failed to extract text from page ${i + 1}:`, err);
                        }
                      }
                      
                      if (textSections.length > 0) {
                        console.log("🔍 PDF: Found sections from text extraction:", textSections);
                        (window as any).__pdfOutline = textSections;
                        window.dispatchEvent(new CustomEvent('pdf-outline', { detail: { sections: textSections } }));
                      }
                    } catch (err) {
                      console.log("🔍 PDF: Text-based section extraction failed:", err);
                    }
                  }
                } catch (err) {
                  console.log("🔍 PDF: Outline extraction completely failed:", err);
                }
              })();
              if (pendingNavRef.current !== null) {
                try {
                  pageNavigationPluginInstance.jumpToPage(pendingNavRef.current);
                } catch {}
                scrollToPageIndex(pendingNavRef.current ?? 0);
                pendingNavRef.current = null;
              }
              // Apply any globally-persisted pending nav
              const globalPending = (window as any).__pendingPdfNav;
              if (typeof globalPending === 'number') {
                try { pageNavigationPluginInstance.jumpToPage(globalPending); } catch {}
                scrollToPageIndex(globalPending ?? 0);
                (window as any).__pendingPdfNav = null;
              }
            }}
            onPageChange={(e) => {
              if (onPageChange) {
                onPageChange(e.currentPage + 1); // Convert back to 1-based
              }
            }}
          />
        </div>
      </Worker>
    </div>
  );
};

export default PDFViewer;