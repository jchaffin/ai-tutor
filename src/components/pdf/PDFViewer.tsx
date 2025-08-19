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
  const rootRef = useRef<HTMLDivElement | null>(null);
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
      
      // Safety check for DOM elements
      if (!el || !container) {
        console.log(`🔍 PDF: DOM elements not ready for page ${zeroBasedIndex}, attempt ${11 - attempts}/10`);
        setTimeout(() => scrollToPageIndex(zeroBasedIndex, attempts - 1), 150);
        return;
      }
      
      if (el) {
        if (container && typeof (container as any).scrollTo === 'function') {
          try {
            const contRect = container.getBoundingClientRect();
            const pageRect = el.getBoundingClientRect();
            const delta = (pageRect.top - contRect.top) + container.scrollTop;
            const targetTop = Math.max(0, delta - (container.clientHeight / 2) + (pageRect.height / 2));
            container.scrollTo({ top: targetTop, behavior: 'smooth' });
          } catch (scrollError) {
            console.warn("🔍 PDF: Smooth scroll failed, using fallback:", scrollError);
            try {
              const contRect = container.getBoundingClientRect();
              const pageRect = el.getBoundingClientRect();
              const delta = (pageRect.top - contRect.top) + container.scrollTop;
              const targetTop = Math.max(0, delta - (container.clientHeight / 2) + (pageRect.height / 2));
              container.scrollTop = targetTop;
            } catch (fallbackError) {
              console.warn("🔍 PDF: Fallback scroll also failed:", fallbackError);
            }
          }
        } else {
          try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (scrollError) {
            console.warn("🔍 PDF: scrollIntoView failed:", scrollError);
          }
        }
        return;
      }
      
      // Fallback to any future attribute we may support
      const fallback = document.querySelector(`[data-page-number="${zeroBasedIndex + 1}"]`) as HTMLElement | null;
      if (fallback && container) {
        try {
          if (typeof (container as any).scrollTo === 'function') {
            const contRect = container.getBoundingClientRect();
            const pageRect = fallback.getBoundingClientRect();
            const delta = (pageRect.top - contRect.top) + container.scrollTop;
            const targetTop = Math.max(0, delta - (container.clientHeight / 2) + (pageRect.height / 2));
            container.scrollTo({ top: targetTop, behavior: 'smooth' });
          } else {
            fallback.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } catch (fallbackError) {
          console.warn("🔍 PDF: Fallback navigation failed:", fallbackError);
        }
        return;
      }
    } catch (error) {
      console.warn("🔍 PDF: Error in scrollToPageIndex:", error);
    }
    
    // Retry with delay if elements aren't ready
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
 
  // Utility: draw a circular overlay on a page using pixel rect relative to page layer
  const drawCircleOnPage = (pageIndex: number, rect: { left: number; top: number; width: number; height: number }) => {
    const layer = document.querySelector(`[data-testid="core__page-layer-${pageIndex}"]`) as HTMLElement | null;
    if (!layer) return;
    let container = layer.querySelector('.tutor-circle-overlay-container') as HTMLElement | null;
    if (!container) {
      container = document.createElement('div');
      container.className = 'tutor-circle-overlay-container';
      Object.assign(container.style, {
        position: 'absolute',
        inset: '0px',
        pointerEvents: 'none',
        zIndex: '9999',
      } as CSSStyleDeclaration);
      layer.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = 'tutor-circle-annotation';
    Object.assign(el.style, {
      position: 'absolute',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      border: '3px solid #ef4444',
      borderRadius: '9999px',
      boxShadow: '0 0 0 2px rgba(239,68,68,0.25)',
    } as CSSStyleDeclaration);
    container.appendChild(el);
  };

  const clearAllCircles = () => {
    document.querySelectorAll('.tutor-circle-overlay-container').forEach((el) => el.remove());
  };

  // REMOVED: highlightPlugin that was creating random boxes
  // Only use searchPlugin's native highlighting for actual text content

  const defaultLayoutPluginInstance = useRef(defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[0], // Thumbnails
      defaultTabs[1], // Bookmarks
    ],
  })).current;

  // Utility: find a text occurrence inside an element and return its DOMRange and page-relative rect
  const normalizeSpaces = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const findTextRectInElement = (root: HTMLElement, term: string): { rect: DOMRect; range: Range } | null => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const lowerTerm = normalizeSpaces(term.toLowerCase());
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = normalizeSpaces(node.nodeValue || '');
      if (text) {
        const idx = text.toLowerCase().indexOf(lowerTerm);
        if (idx !== -1) {
          try {
            const range = document.createRange();
            // Map idx back to original node offsets by scanning original string
            const original = (node.nodeValue || '').replace(/\u00a0/g, ' ');
            // Best effort: find the substring position ignoring repeated spaces
            let oi = 0, ti = 0, start = -1, end = -1;
            const target = lowerTerm;
            const lowerOriginal = original.toLowerCase();
            while (oi < lowerOriginal.length && ti < target.length) {
              const oc = lowerOriginal[oi];
              const tc = target[ti];
              if (/\s/.test(oc) && /\s/.test(tc)) {
                // consume contiguous spaces
                while (oi < lowerOriginal.length && /\s/.test(lowerOriginal[oi])) oi++;
                while (ti < target.length && /\s/.test(target[ti])) ti++;
                if (start === -1) start = oi;
                continue;
              }
              if (oc === tc) {
                if (start === -1) start = oi;
                oi++; ti++;
              } else {
                // Not matching, break
                start = -1; end = -1; break;
              }
            }
            if (start !== -1 && ti === target.length) {
              end = oi;
            } else {
              start = idx; end = idx + lowerTerm.length;
            }
            range.setStart(node, Math.max(0, start));
            range.setEnd(node, Math.min((node.nodeValue || '').length, end));
            const rect = range.getBoundingClientRect();
            return { rect, range };
          } catch {}
        }
      }
      node = walker.nextNode();
    }
    return null;
  };

  // Utility: clear prior overlays within this viewer
  const clearCircleOverlays = () => {
    const container = rootRef.current;
    if (!container) return;
    const overlays = container.querySelectorAll('[data-circle-overlay="1"]');
    overlays.forEach((el) => el.parentElement?.removeChild(el));
  };

  // Listen for events to circle a specific text (e.g., "Table 1")
  useEffect(() => {
    const process = (detail: any, attempts = 10) => {
      const eventDetail = detail || {};
      const text = eventDetail.text as string | undefined;
      const oneBasedPage = eventDetail.page as number | undefined;
      if (!text || !rootRef.current) return;

      const pages: HTMLElement[] = Array.from(
        rootRef.current.querySelectorAll('[data-testid^="core__page-layer-"]')
      ) as HTMLElement[];

      if (pages.length === 0) {
        console.log('🔴 pdf-circle-text: pages not ready, retrying...', { attempts });
        if (attempts > 0) setTimeout(() => process(eventDetail, attempts - 1), 150);
        return;
      }

      console.log('🟢 pdf-circle-text: searching', { text, page: oneBasedPage, pageCount: pages.length });
      clearCircleOverlays();

      const zeroBased = typeof oneBasedPage === 'number' && oneBasedPage > 0 ? oneBasedPage - 1 : undefined;
      const indices = zeroBased !== undefined ? [zeroBased] : pages.map((_, i) => i);
      const tryTerms = [text, text.replace(/\s+/g, ' ')];
      for (const i of indices) {
        const pageEl = pages[i];
        if (!pageEl) continue;
        let found: { rect: DOMRect; range: Range } | null = null;
        for (const t of tryTerms) {
          found = findTextRectInElement(pageEl, t);
          if (found) break;
        }
        // Fallback: try just the word 'Table' part to still provide a cue
        if (!found) {
          const wordOnly = (text.match(/^[A-Za-z]+/) || [])[0];
          if (wordOnly) found = findTextRectInElement(pageEl, wordOnly);
        }
        if (found) {
          console.log('✅ pdf-circle-text: found match on page', i + 1);
          const layerRect = pageEl.getBoundingClientRect();
          const localRect = {
            left: found.rect.left - layerRect.left,
            top: found.rect.top - layerRect.top,
            width: found.rect.width,
            height: found.rect.height,
          };
          drawCircleOnPage(i, localRect);
          try { scrollToPageIndex(i); } catch {}
          return;
        }
      }
      if (attempts > 0) setTimeout(() => process(eventDetail, attempts - 1), 150);
    };

    const handler = (event: any) => {
      const text = event?.detail?.text as string | undefined;
      const oneBasedPage = event?.detail?.page as number | undefined;
      if (!text) return;
      console.log('📩 pdf-circle-text event received', { text, page: oneBasedPage });
      process({ text, page: oneBasedPage });
    };
    window.addEventListener('pdf-circle-text', handler);
    return () => window.removeEventListener('pdf-circle-text', handler);
  }, []);

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
    
    // Configure auto-advance settings
    api.__pdfAutoAdvance = {
      intervalMs: 3500,
      enabled: true
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
          if (searchPluginInstanceRef.current) {
            searchPluginInstanceRef.current.clearHighlights(); 
            console.log("🔍 PDF: Previous highlights cleared");
          }
        } catch (err) {
          console.warn("🔍 PDF: Failed to clear highlights:", err);
        }
        
        console.log("🔍 PDF: Applying new highlights for:", reqKeywords);
        
        // Add safety check for search plugin instance
        if (!searchPluginInstanceRef.current) {
          console.error("🔍 PDF: Search plugin instance not available");
          return;
        }
        
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
      if (newKeywords && searchPluginInstanceRef.current) {
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
          if (!searchPluginInstanceRef.current) {
            console.error("🔍 PDF: Search plugin instance not available for jump");
            return;
          }
          const result = searchPluginInstanceRef.current.jumpToMatch(index);
          if (!result && attempts < 5) {
            attempts += 1;
            // Re-apply highlights if needed, then retry
            const kw = lastKeywordsRef.current;
            if (kw && searchPluginInstanceRef.current) {
              try { await searchPluginInstanceRef.current.highlight(kw as any); } catch {}
            }
            setTimeout(tryJump, 150);
          }
        } catch (e) {
          if (attempts < 5) {
            attempts += 1;
            const kw = lastKeywordsRef.current;
            if (kw && searchPluginInstanceRef.current) {
              try { await searchPluginInstanceRef.current.highlight(kw as any); } catch {}
            }
            setTimeout(tryJump, 150);
          }
        }
      };
      tryJump();
    };

    const handleClearHighlights = () => {
      try { 
        if (searchPluginInstanceRef.current) {
          searchPluginInstanceRef.current.clearHighlights(); 
        }
      } catch {}
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

  // Listen for requests to circle a table label (e.g., "Table 1")
  useEffect(() => {
    const circleByLabel = (label: string) => {
      const requestId = `circle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const onResults = (e: any) => {
        if (e?.detail?.requestId !== requestId) return;
        window.removeEventListener('pdf-search-results', onResults as EventListener);
        const results = (e?.detail?.results || []) as Array<{ pageIndex: number; matchIndex: number }>;
        if (!results.length) return;
        const first = results[0];
        setTimeout(() => {
          try {
            const layer = document.querySelector(`[data-testid="core__page-layer-${first.pageIndex}"]`) as HTMLElement | null;
            if (!layer) return;
            const hlEls = layer.querySelectorAll('.rpv-search__highlight');
            if (!hlEls || hlEls.length === 0) return;
            const layerRect = layer.getBoundingClientRect();
            let minLeft = Number.POSITIVE_INFINITY;
            let minTop = Number.POSITIVE_INFINITY;
            let maxRight = 0;
            let maxBottom = 0;
            hlEls.forEach((n) => {
              const r = (n as HTMLElement).getBoundingClientRect();
              minLeft = Math.min(minLeft, r.left);
              minTop = Math.min(minTop, r.top);
              maxRight = Math.max(maxRight, r.right);
              maxBottom = Math.max(maxBottom, r.bottom);
            });
            if (!isFinite(minLeft) || !isFinite(minTop)) return;
            const pad = 16;
            const pageW = layerRect.width;
            const pageH = layerRect.height;
            const captionTop = Math.max(0, minTop - layerRect.top);
            const targetWidth = Math.min(pageW - pad * 2, pageW * 0.92);
            const targetLeft = Math.max(0, (pageW - targetWidth) / 2);
            const extendDown = Math.min(pageH * 0.32, pageH - captionTop - pad * 2);
            const targetTop = Math.max(0, captionTop - pad * 0.5);
            const targetHeight = Math.max(48, extendDown + (maxBottom - minTop));
            drawCircleOnPage(first.pageIndex, {
              left: targetLeft,
              top: Math.min(targetTop, pageH - pad - targetHeight),
              width: targetWidth,
              height: Math.min(targetHeight, pageH - targetTop - pad),
            });
          } catch {}
        }, 120);
      };
      window.addEventListener('pdf-search-results', onResults as EventListener, { once: true });
      try { clearAllCircles(); } catch {}
      window.dispatchEvent(new CustomEvent('pdf-search-request', {
        detail: { requestId, keywords: label }
      }));
    };

    const handleCircleTable = (event: any) => {
      const label = String(event?.detail?.label || '').trim() || 'Table 1';
      // Try to jump to the first detected page quickly once results return; circleByLabel will handle drawing
      circleByLabel(label);
    };
    const handleCircleFigure = (event: any) => {
      const label = String(event?.detail?.label || '').trim() || 'Figure 1';
      circleByLabel(label);
    };
    const handleClearAnnotations = () => clearAllCircles();

    window.addEventListener('tutor-circle-table', handleCircleTable as EventListener);
    window.addEventListener('tutor-circle-figure', handleCircleFigure as EventListener);
    window.addEventListener('tutor-annotations-clear', handleClearAnnotations as EventListener);
    return () => {
      window.removeEventListener('tutor-circle-table', handleCircleTable as EventListener);
      window.removeEventListener('tutor-circle-figure', handleCircleFigure as EventListener);
      window.removeEventListener('tutor-annotations-clear', handleClearAnnotations as EventListener);
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
    <div ref={rootRef} className="w-full h-full">
      <Worker workerUrl="/pdf.worker.js">
        <div style={{ height: '100%' }}>
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
                      const seen = new Set<string>();
                      const maxPages = Math.min(numPages, 30);
                      
                      const pushSection = (rawTitle: string, pageIdx: number) => {
                        const title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
                        if (!title) return;
                        const key = `${pageIdx}:${title.toLowerCase()}`;
                        if (seen.has(key)) return;
                        seen.add(key);
                        textSections.push({ title, pageIndex: pageIdx });
                      };
                      
                      for (let i = 0; i < maxPages; i++) {
                        try {
                          const page = await (e as any).doc.getPage(i + 1);
                          const textContent = await page.getTextContent();
                          const items = (textContent.items || []) as any[];
                          
                          // Group by visual line using Y coordinate (transform[5]) and keep an estimated font size per line
                          const linesMap = new Map<number, { y: number; parts: string[]; maxSize: number }>();
                          const allSizes: number[] = [];
                          for (const it of items) {
                            const str = String(it?.str || '').trim();
                            if (!str) continue;
                            const y = Math.round(Number(it?.transform?.[5] ?? 0));
                            const a = Number(it?.transform?.[0] ?? 0);
                            const d = Number(it?.transform?.[3] ?? 0);
                            const estSize = Math.max(0, Math.sqrt(a * a + d * d));
                            allSizes.push(estSize);
                            if (!linesMap.has(y)) linesMap.set(y, { y, parts: [], maxSize: 0 });
                            const rec = linesMap.get(y) as any;
                            rec.parts.push(str);
                            if (estSize > rec.maxSize) rec.maxSize = estSize;
                          }
                          const median = (() => {
                            if (allSizes.length === 0) return 0;
                            const s = allSizes.slice().sort((x, y) => x - y);
                            const mid = Math.floor(s.length / 2);
                            return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
                          })();
                          
                          const lines = Array.from(linesMap.values())
                            .sort((a, b) => b.y - a.y)
                            .map((l) => ({ text: l.parts.join(' ').replace(/\s+/g, ' ').trim(), size: l.maxSize }))
                            .filter((l) => !!l.text);
                          
                          // Heuristics for headings
                          const isTitleCase = (s: string) => {
                            // at least two words start with capital and not ALL CAPS paragraphs
                            const words = s.split(/\s+/);
                            const capsStart = words.filter((w) => /^[A-Z][A-Za-z0-9\-]*$/.test(w)).length;
                            return capsStart >= Math.min(2, Math.ceil(words.length * 0.5));
                          };
                          const isAllCapsShort = (s: string) => /^(?:[A-Z0-9][A-Z0-9\-]*\s*){1,8}$/.test(s);
                          const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
                          const numOnly = /^\d+(?:\.\d+)*$/;
                          const numWithTitle = /^\d+(?:\.\d+)*\s+.+/;
                          const namedSections = /^(Abstract|Introduction|Background|Related\s+Work|Methods?|Approach|Experiments?|Results|Discussion|Conclusions?|References|Appendix|Baselines?)\b/i;
                          const tableFigure = /^(Table|Figure)\s+\d+[A-Za-z]?\b/i;
                          
                          for (let li = 0; li < lines.length; li++) {
                            const { text: line, size } = lines[li];
                            if (!line) continue;
                            
                            // 1) Number-only heading: try to merge with nearby title line (next or previous)
                            if (numOnly.test(line)) {
                              const next = lines[li + 1]?.text || '';
                              const prev = lines[li - 1]?.text || '';
                              const candidate = isTitleCase(next) ? next : (isTitleCase(prev) ? prev : '');
                              if (candidate) {
                                pushSection(`${line} ${candidate}`, i);
                              } else {
                                pushSection(line, i);
                              }
                              continue;
                            }
                            
                            // 2) Number with title on same line
                            if (numWithTitle.test(line)) {
                              pushSection(line, i);
                              continue;
                            }
                            
                            // 3) Canonical named sections
                            if (namedSections.test(line)) {
                              pushSection(line, i);
                              continue;
                            }
                            
                            // 4) Table/Figure labels
                            if (tableFigure.test(line)) {
                              pushSection(line, i);
                              continue;
                            }
                            
                            // 5) Font-size based heading heuristic
                            const wc = wordCount(line);
                            const looksHeading = (size > median * 1.15) && wc > 0 && wc <= 12 && (isTitleCase(line) || isAllCapsShort(line));
                            if (looksHeading) {
                              pushSection(line, i);
                              continue;
                            }
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
