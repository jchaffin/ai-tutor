"use client";

import React, { useState, useEffect, useRef } from "react";
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { searchPlugin, SingleKeyword, Match } from '@react-pdf-viewer/search';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';
// Removed unused Tesseract import
import { ocrDetectTableBoundsFromLayer, analyzeContentBoundsAroundLabel } from '@/lib/pdfClient';

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

  // Expose circle table function globally for easy testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Define the function that directly calls OCR detection
      const circleTable = async (label: string) => {
        console.log(`🎯 Manual circle table call: ${label}`);
        
        try {
          // Find the page with the table first
          const requestId = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const onResults = (e: any) => {
            if (e?.detail?.requestId !== requestId) return;
            window.removeEventListener('pdf-search-results', onResults as EventListener);
            const results = (e?.detail?.results || []) as Array<{ pageIndex: number; matchIndex: number }>;
            if (!results.length) {
              console.log(`🎯 No search results found for label: ${label}`);
              return;
            }
            
            const first = results[0];
            console.log(`🎯 Found label on page ${first.pageIndex + 1}, starting OCR analysis...`);
            
            // Perform OCR-based table detection directly
            performOCRTableDetection(first.pageIndex, label)
              .then((bounds) => {
                if (bounds) {
                  drawCircleOnPage(first.pageIndex, bounds);
                } else {
                  console.log('🎯 OCR returned no bounds; falling back to DOM analysis');
                  try { circleByLabel(label); } catch {}
                }
              })
              .catch(() => {
                try { circleByLabel(label); } catch {}
              });
          };
          
          window.addEventListener('pdf-search-results', onResults as EventListener);
          window.dispatchEvent(new CustomEvent('pdf-search-request', { 
            detail: { 
              requestId,
              keywords: [{ keyword: label, matchCase: false }]
            } 
          }));
          
        } catch (error) {
          console.error('🎯 Error in manual circleTable:', error);
          // Fallback to old method
          circleByLabel(label);
        }
      };

      // Expose it globally
      (window as any).circleTable = circleTable;
      (window as any).tutorSetAnnotationPrefs = (prefs: { padding?: number; shape?: 'ellipse' | 'rect' }) => {
        (window as any).__tutorAnnotationPrefs = {
          ...(window as any).__tutorAnnotationPrefs,
          ...prefs,
        };
      };
      
      // Also expose a debug function to test OCR on current page
      (window as any).testOCR = async (pageIndex: number = 0, label: string) => {
        console.log(`🎯 Testing OCR on page ${pageIndex + 1} for label: ${label}`);
        try {
          const bounds = await performOCRTableDetection(pageIndex, label);
          if (bounds) {
            drawCircleOnPage(pageIndex, bounds);
          } else {
            console.log('🎯 OCR returned no bounds; falling back to DOM analysis');
            try { circleByLabel(label); } catch {}
          }
        } catch {
          try { circleByLabel(label); } catch {}
        }
      };
      
      console.log('🎯 circleTable function exposed globally with direct OCR');
      console.log('🎯 testOCR(pageIndex) function also available for debugging');

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
          console.log("🎯 PDF API: Clearing all highlights and circles");
          try {
            if (searchPluginInstanceRef.current) {
              searchPluginInstanceRef.current.clearHighlights();
              console.log("🎯 PDF API: All highlights cleared successfully");
            } else {
              console.warn("🎯 PDF API: Search plugin not available for clearing highlights");
            }
            // Also clear circles
            clearAllCircles();
            console.log("🎯 PDF API: All circles cleared successfully");
          } catch (error) {
            console.error("🎯 PDF API: Error clearing highlights/circles:", error);
          }
        },
        goToPage: (pageNumber: number) => {
          console.log("🎯 PDF API: Going to page:", pageNumber);
          if (onPageChange) {
            onPageChange(pageNumber);
          }
        },
        searchAndHighlight: async (searchTerm: string, options: any) => {
          console.log("🎯 PDF API: Searching for text:", searchTerm);
          
          if (!searchTerm || !searchPluginInstanceRef.current) {
            console.warn("🎯 PDF API: Invalid search term or plugin not available");
            if (options.onSearchComplete) {
              options.onSearchComplete([]);
            }
            return;
          }

          try {
            // Clear previous highlights first
            searchPluginInstanceRef.current.clearHighlights();
            
            // Perform the actual search using react-pdf-viewer
            const matches = await searchPluginInstanceRef.current.highlight([{
              keyword: searchTerm,
              matchCase: false
            }]);
            
            console.log("🎯 PDF API: Real search results:", matches);
            
            // Convert matches to the expected format
            const results = matches.map((match, index) => ({
              text: searchTerm,
              matchIndex: index,
              pageIndex: match.pageIndex,
              startIndex: match.startIndex,
              endIndex: match.endIndex,
              highlightAreas: [{
                pageIndex: match.pageIndex,
                left: 0, // react-pdf-viewer handles positioning internally
                top: 0,
                width: 100,
                height: 2
              }]
            }));
            
            if (options.onSearchComplete) {
              options.onSearchComplete(results);
            }
            
            // Jump to first match if found
            if (matches.length > 0) {
              searchPluginInstanceRef.current.jumpToMatch(0);
            }
            
          } catch (error) {
            console.error("🎯 PDF API: Search failed:", error);
            if (options.onSearchComplete) {
              options.onSearchComplete([]);
            }
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

  // Create plugins (stable instance) with simple, clean highlighting
  const searchPluginInstanceRef = useRef(searchPlugin({ 
    enableShortcuts: true,
    keyword: ''
  }));
  const searchPluginInstance = searchPluginInstanceRef.current;
  const pageNavigationPluginInstanceRef = useRef(pageNavigationPlugin());
  const pageNavigationPluginInstance = pageNavigationPluginInstanceRef.current;

  // Lightweight in-view search overlay that leverages the search plugin
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const openSearchOverlay = () => {
    setShowSearchOverlay(true);
    // Defer focus to next tick to ensure input exists
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const closeSearchOverlay = () => {
    setShowSearchOverlay(false);
    setSearchValue("");
    setMatchInfo({ current: 0, total: 0 });
    try { searchPluginInstanceRef.current?.clearHighlights(); } catch {}
  };

  // Intercept Cmd/Ctrl+F and route to in-view search that can match across lines
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const cmdOrCtrl = isMac ? ev.metaKey : ev.ctrlKey;
      if (cmdOrCtrl && (ev.key === 'f' || ev.key === 'F')) {
        ev.preventDefault();
        openSearchOverlay();
      } else if (ev.key === 'Escape' && showSearchOverlay) {
        ev.preventDefault();
        closeSearchOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSearchOverlay]);

  const normalizedPhrase = (s: string) =>
    String(s || "")
      .normalize('NFKC')
      // Normalize quotes and dashes
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u2010-\u2015]/g, '-')
      // Remove soft hyphen and zero-width chars
      .replace(/[\u00ad\u200b-\u200f\ufeff]/g, '')
      // Collapse any whitespace
      .replace(/\s+/g, ' ')
      .trim();

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build a forgiving regex that tolerates whitespace, hyphenation, and soft hyphen differences
  const buildFlexibleRegexFromPhrase = (phrase: string): RegExp => {
    const escaped = escapeRegExp(phrase);
    // Tolerate any whitespace (including NBSP/soft hyphen) spans
    let pattern = escaped
      .replace(/\s+/g, '(?:[\\s\\u00a0\\u00ad]+)')
      // Treat hyphen-like chars as optional, with optional following whitespace
      .replace(/-/g, '(?:[-\\u2010-\\u2015]?[\\s\\u00a0\\u00ad]*)');
    // Also allow stray soft hyphens anywhere to be ignored
    pattern = pattern.replace(/\B/g, '(?:\\u00ad)?');
    return new RegExp(pattern, 'i');
  };

  // Only allow flexible regex fallback for simple phrases (letters, numbers, spaces, hyphens)
  const isSafeForRegexFallback = (s: string): boolean => {
    try {
      return /^[\p{L}\p{N}\s-]+$/u.test(s) && s.trim().length >= 3;
    } catch {
      return false;
    }
  };

  // Highlight a section when the query looks like a numeric heading (e.g., "3.2" or "2.1.4")
  const highlightSectionByHeading = (heading: string): boolean => {
    try {
      const layers = Array.from(document.querySelectorAll('[data-testid^="core__page-layer-" ]')) as HTMLElement[];
      if (!layers.length) return false;
      const escapedHeading = escapeRegExp(heading);
      const headingRegex = new RegExp('^\\s*' + escapedHeading + '(?:\\.|\\s|$)');

      for (const layer of layers) {
        const layerRect = layer.getBoundingClientRect();
        const textEls = Array.from(layer.querySelectorAll('span, div')) as HTMLElement[];
        const items = textEls
          .filter((el) => (el.textContent || '').trim().length > 0)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              el,
              text: normalizedPhrase(el.textContent || ''),
              left: r.left - layerRect.left,
              top: r.top - layerRect.top,
              right: r.right - layerRect.left,
              bottom: r.bottom - layerRect.top,
            };
          })
          .sort((a, b) => a.top - b.top || a.left - b.left);

        const idx = items.findIndex((it) => headingRegex.test(it.text));
        if (idx === -1) continue;

        const anchor = items[idx];
        const anchorLeft = anchor.left;
        const colTolerance = 140; // px band to stay within the same column
        const inSameColumn = (x: number) => Math.abs(x - anchorLeft) <= colTolerance;
        let minX = anchor.left;
        let maxX = anchor.right;
        let topY = anchor.top;
        let bottomY = anchor.bottom;

        // Grow downward until the next heading-like line (same column), or end of page
        for (let i = idx + 1; i < items.length; i++) {
          const it = items[i];
          // Stop when we detect the next numeric heading near the same column
          if (/^\s*\d+(?:\.\d+)+(?:\.|\s|$)/.test(it.text) && inSameColumn(it.left)) {
            break;
          }
          if (inSameColumn(it.left)) {
            minX = Math.min(minX, it.left);
            maxX = Math.max(maxX, it.right);
            bottomY = Math.max(bottomY, it.bottom);
          }
        }

        // Draw one consolidated overlay for the section on this page
        const m = (layer.getAttribute('data-testid') || '').match(/core__page-layer-(\d+)/);
        const pageIndex = m ? Math.max(0, parseInt(m[1], 10) || 0) : 0;
        clearHighlightOverlays();
        drawHighlightOnPage(pageIndex, {
          left: Math.max(0, minX),
          top: Math.max(0, topY),
          width: Math.max(1, maxX - minX),
          height: Math.max(1, bottomY - topY),
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const runSearch = async (value: string) => {
    const phrase = normalizedPhrase(value);
    if (!phrase) {
      try { searchPluginInstanceRef.current?.clearHighlights(); } catch {}
      setMatchInfo({ current: 0, total: 0 });
      return;
    }
    // If the phrase looks like a numeric section heading, try section-highlighting first
    if (/^\d+(?:\.\d+)+$/.test(phrase)) {
      const ok = highlightSectionByHeading(phrase);
      if (ok) {
        setMatchInfo({ current: 1, total: 1 });
        return;
      }
    }
    try {
      // Attempt 1: direct phrase
      let matches = await searchPluginInstanceRef.current.highlight([{ keyword: phrase, matchCase: false }]);
      // Attempt 2: flexible regex only for simple alphanumeric phrases
      if (matches.length === 0 && isSafeForRegexFallback(phrase)) {
        const regex = buildFlexibleRegexFromPhrase(phrase);
        matches = await searchPluginInstanceRef.current.highlight(regex as any);
      }
      setMatchInfo({ current: matches.length ? 1 : 0, total: matches.length });
      if (matches.length > 0) {
        searchPluginInstanceRef.current.jumpToMatch(0);
      }
    } catch {
      setMatchInfo({ current: 0, total: 0 });
    }
  };

  const jumpToNext = () => {
    try {
      const m = searchPluginInstanceRef.current.jumpToNextMatch();
      if (m) setMatchInfo((info) => ({ ...info, current: Math.min(info.total, info.current + 1) }));
    } catch {}
  };
  const jumpToPrev = () => {
    try {
      const m = searchPluginInstanceRef.current.jumpToPreviousMatch();
      if (m) setMatchInfo((info) => ({ ...info, current: Math.max(1, info.current - 1) }));
    } catch {}
  };
 
  // Utility: draw an overlay (ellipse by default; rectangle optional) with outward padding
  const drawCircleOnPage = (
    pageIndex: number,
    rect: { left: number; top: number; width: number; height: number },
  ) => {
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

    // Read global overlay preferences if present
    const prefs = (window as any).__tutorAnnotationPrefs || { padding: 8, shape: 'ellipse' };
    const padding = Math.max(0, Number(prefs.padding ?? 8));
    const shape = String(prefs.shape || 'ellipse');

    // Expand outward so border doesn't overlap table text
    const layerRect = layer.getBoundingClientRect();
    const padded = {
      left: Math.max(0, rect.left - padding),
      top: Math.max(0, rect.top - padding),
      width: Math.min(layerRect.width, rect.width + padding * 2),
      height: Math.min(layerRect.height, rect.height + padding * 2),
    };

    Object.assign(el.style, {
      position: 'absolute',
      left: `${padded.left}px`,
      top: `${padded.top}px`,
      width: `${padded.width}px`,
      height: `${padded.height}px`,
      border: '3px solid #ef4444',
      borderRadius: shape === 'rect' ? '12px' : '9999px',
      boxShadow: '0 0 0 2px rgba(239,68,68,0.25)',
    } as CSSStyleDeclaration);
    container.appendChild(el);
  };

  const clearAllCircles = () => {
    document.querySelectorAll('.tutor-circle-overlay-container').forEach((el) => el.remove());
  };

  // Removed in-component detectTableBoundaries; imported from '@/lib/pdfClient'

  // OCR-based table detection using canvas rendering of the page layer
  const performOCRTableDetection = async (pageIndex: number, label: string): Promise<{ left: number; top: number; width: number; height: number } | null> => {
    try {
      const layer = document.querySelector(`[data-testid="core__page-layer-${pageIndex}"]`) as HTMLElement | null;
      if (!layer) return null;
      const finalBounds = await ocrDetectTableBoundsFromLayer(layer);
      if (!finalBounds) return null;
      return finalBounds;
    } catch (error) {
      console.error('🎯 OCR Table Detection Error:', error);
      return null;
    }
  };

  // Wait for a page layer to be present in the DOM (react-pdf-viewer virtualizes pages)
  const waitForPageLayer = async (pageIndex: number, attempts: number = 15, delayMs: number = 150): Promise<HTMLElement | null> => {
    for (let i = 0; i < attempts; i++) {
      const layer = document.querySelector(`[data-testid="core__page-layer-${pageIndex}"]`) as HTMLElement | null;
      if (layer) return layer;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  };

  // Search for a label and draw a circle around nearby content using PDF/text/DOM heuristics
  const circleByLabel = (label: string) => {
    const requestId = `circle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onResults = (e: any) => {
      if (e?.detail?.requestId !== requestId) return;
      window.removeEventListener('pdf-search-results', onResults as EventListener);
      const results = (e?.detail?.results || []) as Array<{ pageIndex: number; matchIndex: number }>; if (!results.length) return;
      const first = results[0];
      setTimeout(async () => {
        try {
          const layer = document.querySelector(`[data-testid="core__page-layer-${first.pageIndex}"]`) as HTMLElement | null;
          if (!layer) return;
          // Removed PDF.js text-boundary shortcut; proceed with DOM-based analysis below
          const hlEls = layer.querySelectorAll('.rpv-search__highlight');
          if (!hlEls || hlEls.length === 0) return;
          const layerRect = layer.getBoundingClientRect();
          let minLeft = Number.POSITIVE_INFINITY, minTop = Number.POSITIVE_INFINITY, maxRight = 0, maxBottom = 0;
          hlEls.forEach((n) => { const r = (n as HTMLElement).getBoundingClientRect(); minLeft = Math.min(minLeft, r.left); minTop = Math.min(minTop, r.top); maxRight = Math.max(maxRight, r.right); maxBottom = Math.max(maxBottom, r.bottom); });
          if (!isFinite(minLeft) || !isFinite(minTop)) return;
          const labelLeft = minLeft - layerRect.left;
          const labelTop = minTop - layerRect.top;
          const labelWidth = maxRight - minLeft;
          const labelHeight = maxBottom - minTop;
          const isTable = /table/i.test(label);
          const isFigure = /figure/i.test(label);
          const contentBounds = analyzeContentBoundsAroundLabel(layer, new DOMRect(minLeft, minTop, maxRight - minLeft, maxBottom - minTop), isTable ? 'table' : (isFigure ? 'figure' : 'generic'));
          const layerRect2 = layer.getBoundingClientRect();
          let circleLeft: number, circleTop: number, circleWidth: number, circleHeight: number;
          if (contentBounds) {
            const padding = /table/i.test(label) ? 15 : /figure/i.test(label) ? 20 : 10;
            circleLeft = Math.max(0, contentBounds.left - padding);
            circleTop = Math.max(0, contentBounds.top - padding);
            circleWidth = Math.min(layerRect2.width - circleLeft - padding, contentBounds.width + padding * 2);
            circleHeight = Math.min(layerRect2.height - circleTop - padding, contentBounds.height + padding * 2);
          } else {
            if (/table/i.test(label)) {
              const padding = 20;
              circleLeft = Math.max(0, labelLeft - padding);
              circleTop = Math.max(0, labelTop - padding / 2);
              circleWidth = Math.min(layerRect2.width - circleLeft - padding, Math.max(labelWidth + padding * 4, 300));
              circleHeight = Math.min(layerRect2.height - circleTop - padding, 150);
            } else if (/figure/i.test(label)) {
              const padding = 25;
              const estimatedWidth = Math.max(labelWidth + padding * 4, 250);
              const estimatedHeight = Math.max(100, estimatedWidth * 0.7);
              circleLeft = Math.max(0, labelLeft - estimatedWidth / 4);
              circleTop = Math.max(0, labelTop - padding);
              circleWidth = Math.min(layerRect2.width - circleLeft - padding, estimatedWidth);
              circleHeight = Math.min(layerRect2.height - circleTop - padding, estimatedHeight);
            } else {
              const padding = 15;
              circleLeft = Math.max(0, labelLeft - padding);
              circleTop = Math.max(0, labelTop - padding);
              circleWidth = Math.min(layerRect2.width - circleLeft, labelWidth + padding * 2);
              circleHeight = Math.min(layerRect2.height - circleTop, labelHeight + padding * 2);
            }
          }
          drawCircleOnPage(first.pageIndex, { left: circleLeft, top: circleTop, width: circleWidth, height: circleHeight });
        } catch (error) {
          console.error(`🎯 Error circling ${label}:`, error);
        }
      }, 120);
    };
    window.addEventListener('pdf-search-results', onResults as EventListener, { once: true });
    try { clearAllCircles(); } catch {}
    const searchTerms = [label];
    if (label.toLowerCase().includes('table')) {
      const num = label.match(/\d+/)?.[0]; if (num) { searchTerms.push(`Table ${num}`); searchTerms.push(`table ${num}`); searchTerms.push(`TABLE ${num}`); }
    } else if (label.toLowerCase().includes('figure')) {
      const num = label.match(/\d+/)?.[0]; if (num) { searchTerms.push(`Figure ${num}`); searchTerms.push(`figure ${num}`); searchTerms.push(`FIGURE ${num}`); searchTerms.push(`Fig. ${num}`); searchTerms.push(`fig. ${num}`); }
    }
    window.dispatchEvent(new CustomEvent('pdf-search-request', { detail: { requestId, keywords: searchTerms } }));
  };

  const defaultLayoutPluginInstance = useRef(defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[0], // Thumbnails
      defaultTabs[1], // Bookmarks
    ],
  })).current;

  // Utility: find a text occurrence inside an element and return its DOMRange and page-relative rect
  const normalizeSpaces = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const findTextRectInElement = (
    root: HTMLElement,
    term: string,
    clip?: { left: number; top: number; right: number; bottom: number }
  ): { rect: DOMRect; range: Range } | null => {
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
            // If a clip is provided, ensure this match lies within the active section bounds
            if (clip) {
              const layerRect = root.getBoundingClientRect();
              const pageLeft = rect.left - layerRect.left;
              const pageTop = rect.top - layerRect.top;
              const pageRight = pageLeft + rect.width;
              const pageBottom = pageTop + rect.height;
              const intersects = !(pageRight < clip.left || pageLeft > clip.right || pageBottom < clip.top || pageTop > clip.bottom);
              if (!intersects) {
                node = walker.nextNode();
                continue;
              }
            }
            return { rect, range };
          } catch {}
        }
      }
      node = walker.nextNode();
    }
    return null;
  };

  // Robust query normalization and n-gram keyword builder for cross-line tolerant search
  const normalizeQuery = (s: string): string => {
    try {
      return s
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
        .replace(/[\u00AD]/g, '') // soft hyphen
        .replace(/-\s+/g, '-') // hyphen+newline -> hyphen
        .replace(/\s+/g, ' ')
        .trim();
    } catch { return s; }
  };

  const buildHyphenVariants = (s: string): string[] => {
    const v = new Set<string>();
    const base = normalizeQuery(s);
    v.add(base);
    if (base.includes('-')) {
      v.add(base.replace(/-/g, ''));
      v.add(base.replace(/-/g, ' '));
    }
    return Array.from(v);
  };

  const tokenizeWords = (s: string): string[] => normalizeQuery(s).split(/\s+/).filter(Boolean);

  const buildNgrams = (s: string, minLen = 3, maxLen = 6, cap = 4): string[] => {
    const words = tokenizeWords(s);
    const grams: string[] = [];
    for (let n = Math.min(maxLen, words.length); n >= minLen; n--) {
      for (let i = 0; i + n <= words.length; i++) {
        grams.push(words.slice(i, i + n).join(' '));
      }
      if (grams.length >= cap) break;
    }
    return grams.slice(0, cap);
  };

  // Utility: clear prior overlays within this viewer
  const clearCircleOverlays = () => {
    const container = rootRef.current;
    if (!container) return;
    const overlays = container.querySelectorAll('[data-circle-overlay="1"]');
    overlays.forEach((el) => el.parentElement?.removeChild(el));
  };

  // Highlight overlays (separate from circles)
  const clearHighlightOverlays = () => {
    const container = rootRef.current;
    if (!container) return;
    const overlays = container.querySelectorAll('[data-highlight-overlay="1"]');
    overlays.forEach((el) => el.parentElement?.removeChild(el));
  };

  const drawHighlightOnPage = (pageIndex: number, rect: { left: number; top: number; width: number; height: number }) => {
    try {
      const layer = document.querySelector(`[data-testid="core__page-layer-${pageIndex}"]`) as HTMLElement | null;
      if (!layer) return;
      // De-dup: if an overlay with the same rounded rect exists on this page, skip
      const key = `${pageIndex}:${Math.round(Math.max(0, rect.left))}:${Math.round(Math.max(0, rect.top))}:${Math.round(Math.max(1, rect.width))}:${Math.round(Math.max(1, rect.height))}`;
      const existing = layer.querySelector(`[data-highlight-key="${key}"]`);
      if (existing) return;
      const overlay = document.createElement('div');
      overlay.setAttribute('data-highlight-overlay', '1');
      overlay.setAttribute('data-highlight-key', key);
      overlay.style.position = 'absolute';
      overlay.style.left = `${Math.max(0, rect.left)}px`;
      overlay.style.top = `${Math.max(0, rect.top)}px`;
      overlay.style.width = `${Math.max(1, rect.width)}px`;
      overlay.style.height = `${Math.max(1, rect.height)}px`;
      overlay.style.background = 'rgba(255, 235, 59, 0.22)';
      overlay.style.border = '1px solid rgba(255, 193, 7, 0.45)';
      overlay.style.borderRadius = '4px';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '3';
      layer.appendChild(overlay);
    } catch {}
  };

  // Word-by-word overlay
  const drawWordOverlay = (pageIndex: number, rect: { left: number; top: number; width: number; height: number }, active: boolean) => {
    try {
      const layer = document.querySelector(`[data-testid="core__page-layer-${pageIndex}"]`) as HTMLElement | null;
      if (!layer) return;
      const key = `w:${pageIndex}:${Math.round(Math.max(0, rect.left))}:${Math.round(Math.max(0, rect.top))}:${Math.round(Math.max(1, rect.width))}:${Math.round(Math.max(1, rect.height))}`;
      const existing = layer.querySelector(`[data-highlight-key="${key}"]`);
      if (existing) return;
      const overlay = document.createElement('div');
      overlay.setAttribute('data-highlight-overlay', '1');
      overlay.setAttribute('data-highlight-key', key);
      overlay.style.position = 'absolute';
      overlay.style.left = `${Math.max(0, rect.left)}px`;
      overlay.style.top = `${Math.max(0, rect.top)}px`;
      overlay.style.width = `${Math.max(1, rect.width)}px`;
      overlay.style.height = `${Math.max(1, rect.height)}px`;
      overlay.style.background = active ? 'rgba(255, 230, 0, 0.45)' : 'rgba(255, 235, 59, 0.18)';
      overlay.style.border = active ? '1px solid rgba(255, 200, 0, 0.75)' : '1px solid rgba(255, 193, 7, 0.4)';
      overlay.style.borderRadius = '3px';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = active ? '5' : '4';
      layer.appendChild(overlay);
    } catch {}
  };

  // Helpers to traverse text nodes (used by sentence expansion)
  const getTextWalker = (root: Node) => document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const previousTextNode = (root: Node, from: Node | null): Node | null => {
    if (!from) return null;
    const walker = getTextWalker(root);
    let prev: Node | null = null;
    let n: Node | null = walker.nextNode();
    while (n) {
      if (n === from) return prev;
      prev = n;
      n = walker.nextNode();
    }
    return null;
  };
  const nextTextNode = (root: Node, from: Node | null): Node | null => {
    if (!from) return null;
    const walker = getTextWalker(root);
    let n: Node | null = walker.nextNode();
    let found = false;
    while (n) {
      if (found) return n;
      if (n === from) found = true;
      n = walker.nextNode();
    }
    return null;
  };

  // Collect word rects within a sentence bounding box (page-relative coords)
  const collectWordRectsInArea = (layer: HTMLElement, clip: DOMRect): Array<{ word: string; rect: { left: number; top: number; width: number; height: number } }> => {
    const layerRect = layer.getBoundingClientRect();
    const intersects = (r: DOMRect) => !(r.right < clip.left || r.left > clip.right || r.bottom < clip.top || r.top > clip.bottom);
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    const results: Array<{ word: string; rect: { left: number; top: number; width: number; height: number } }> = [];
    let n: Node | null = walker.nextNode();
    while (n) {
      const raw = (n.nodeValue || '').replace(/\s+/g, ' ');
      if (raw.trim().length) {
        // Probe whole node rect first
        try {
          const fullRange = document.createRange();
          fullRange.selectNodeContents(n);
          const fullRect = fullRange.getBoundingClientRect();
          if (intersects(fullRect)) {
            // Enumerate words with positions
            const text = raw;
            // index not needed; re.exec maintains state
            const re = /\S+/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) {
              const start = m.index;
              const end = start + m[0].length;
              try {
                const r = document.createRange();
                // Map back to original node indices; since we normalized spaces, approximate by scanning original
                const original = (n.nodeValue || '');
                const mapping = original.replace(/\s+/g, ' ');
                const delta = start;
                const deltaEnd = end;
                // Find approximate offsets in original string by walking
                let oi = 0, ci = 0, startO = 0, endO = 0;
                while (oi < original.length && ci < mapping.length) {
                  const oc = original[oi];
                  const mc = mapping[ci];
                  if (/\s/.test(oc) && /\s/.test(mc)) {
                    while (oi < original.length && /\s/.test(original[oi])) oi++;
                    while (ci < mapping.length && /\s/.test(mapping[ci])) ci++;
                    continue;
                  }
                  if (ci === delta) startO = oi;
                  if (ci === deltaEnd) { endO = oi; break; }
                  oi++; ci++;
                }
                if (!endO) endO = Math.min(original.length, startO + (end - start));
                r.setStart(n, Math.max(0, startO));
                r.setEnd(n, Math.max(0, endO));
                const rect = r.getBoundingClientRect();
                if (rect && rect.width > 0 && rect.height > 0 && intersects(rect)) {
                  results.push({
                    word: m[0],
                    rect: {
                      left: rect.left - layerRect.left,
                      top: rect.top - layerRect.top,
                      width: rect.width,
                      height: rect.height,
                    },
                  });
                }
              } catch {}
            }
          }
        } catch {}
      }
      n = walker.nextNode();
    }
    return results;
  };

  // Semantic stepper state
  const semanticStepperRef = useRef<{
    pageIndex: number;
    words: string[];
    rects: Array<{ word: string; rect: { left: number; top: number; width: number; height: number } }>;
    idx: number;
    lastStepMs: number;
  } | null>(null);

  const resetSemanticStepper = () => { semanticStepperRef.current = null; };

  // Track active semantic sentence overlays so we can re-apply them after
  // search plugin DOM updates without losing prior ones (no flashing).
  const activeSemanticOverlaysRef = useRef<Array<{ text: string; pageIndex: number; ts: number }>>([]);

  const advanceSemanticWord = () => {
    const st = semanticStepperRef.current;
    if (!st) return;
    const now = performance.now();
    if (now - st.lastStepMs < semanticPaceRef.current.dwellMs * 0.9) return;
    st.lastStepMs = now;
    // draw next word overlay
    const targetWord = st.words[st.idx]?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!targetWord) return;
    // find next matching rect after current idx
    for (let i = 0; i < st.rects.length; i++) {
      const candidate = st.rects[i];
      const norm = String(candidate.word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (norm === targetWord) {
        drawWordOverlay(st.pageIndex, candidate.rect, true);
        break;
      }
    }
    st.idx = Math.min(st.words.length, st.idx + 1);
  };

  const expandRangeToSentence = (range: Range, layer: HTMLElement): Range => {
    try {
      const r = range.cloneRange();
      // expand left
      let sNode: Node | null = r.startContainer;
      let sOffset = r.startOffset;
      while (sNode) {
        const text = (sNode.nodeValue || '');
        const left = text.slice(0, sOffset);
        const idx = Math.max(left.lastIndexOf('.'), left.lastIndexOf('!'), left.lastIndexOf('?'));
        if (idx >= 0) { r.setStart(sNode, idx + 1); break; }
        const prev = previousTextNode(layer, sNode);
        if (!prev) { r.setStart(sNode, 0); break; }
        sNode = prev;
        sOffset = (sNode.nodeValue || '').length;
      }
      // expand right
      let eNode: Node | null = r.endContainer;
      let eOffset = r.endOffset;
      while (eNode) {
        const text = (eNode.nodeValue || '');
        const right = text.slice(eOffset);
        const idx = [right.indexOf('.'), right.indexOf('!'), right.indexOf('?')]
          .filter((v) => v >= 0).sort((a,b)=>a-b)[0];
        if (idx !== undefined) { r.setEnd(eNode, Math.min(text.length, eOffset + idx + 1)); break; }
        const nxt = nextTextNode(layer, eNode);
        if (!nxt) { r.setEnd(eNode, text.length); break; }
        eNode = nxt;
        eOffset = 0;
      }
      return r;
    } catch { return range; }
  };

  const drawRangeOverlays = (pageIndex: number, range: Range) => {
    try {
      const rects = Array.from(range.getClientRects());
      const layer = document.querySelector(`[data-testid=\"core__page-layer-${pageIndex}\"]`) as HTMLElement | null;
      if (!layer) return;
      const layerRect = layer.getBoundingClientRect();
      rects.forEach((rc) => {
        drawHighlightOnPage(pageIndex, {
          left: rc.left - layerRect.left,
          top: rc.top - layerRect.top,
          width: rc.width,
          height: rc.height,
        });
      });
    } catch {}
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

  // Highlight queue to prevent conflicts
  const highlightQueueRef = useRef<Array<{ requestId: string; keywords: any; timestamp: number; forceRefresh?: boolean }>>([]);
  const processingHighlightRef = useRef<boolean>(false);
  // Maintain separate buckets so semantic highlights can evolve while keeping baseline/quote highlights
  const baselineKeywordsRef = useRef<SingleKeyword[]>([]);
  const recentSemanticKeywordsRef = useRef<string[]>([]);
  const quoteKeywordsRef = useRef<SingleKeyword[]>([]);
  const MAX_SEMANTIC_KEYWORDS = 5;

  const processHighlightQueue = async () => {
    if (processingHighlightRef.current || highlightQueueRef.current.length === 0) {
      return;
    }

    processingHighlightRef.current = true;
    const currentRequest = highlightQueueRef.current.shift();
    
    if (!currentRequest) {
      processingHighlightRef.current = false;
      return;
    }

    const { requestId, keywords: reqKeywords } = currentRequest;
    console.log("🔍 PDF: Processing highlight request:", { requestId, keywords: reqKeywords });

    try {
      const isSemanticFragment = currentRequest.requestId.includes('semantic-fragment');
      const isQuoteHighlight = currentRequest.requestId.includes('quote-highlight');
      const isCircleSearch = currentRequest.requestId.includes('circle-');
      const forceRefresh = !!currentRequest.forceRefresh;

      // Decide whether to merge with existing highlights or replace them
      let keywordsToApply: SingleKeyword[] = Array.isArray(reqKeywords)
        ? (reqKeywords as SingleKeyword[])
        : [reqKeywords as SingleKeyword];

      if (forceRefresh) {
        // For dynamic speech updates, rebuild full set (no clear to avoid flash)
        const semanticKws: SingleKeyword[] = recentSemanticKeywordsRef.current.map((s) => ({ keyword: s, matchCase: false }));
        keywordsToApply = [
          ...baselineKeywordsRef.current,
          ...quoteKeywordsRef.current,
          ...semanticKws,
        ];
      } else if (isSemanticFragment) {
        // Update sliding window of recent semantic keywords (phrases + tokens)
        const incoming = (Array.isArray(reqKeywords) ? reqKeywords : [reqKeywords]) as any[];
        const incomingStrings: string[] = incoming.map((k) => (typeof k === 'string' ? k : String(k?.keyword || ''))).filter(Boolean);
        incomingStrings.forEach((s) => {
          const norm = s.trim();
          if (!norm) return;
          const exists = recentSemanticKeywordsRef.current.find((x) => x.toLowerCase() === norm.toLowerCase());
          if (!exists) recentSemanticKeywordsRef.current.push(norm);
        });
        // Cap recent semantic to last N items
        if (recentSemanticKeywordsRef.current.length > MAX_SEMANTIC_KEYWORDS) {
          recentSemanticKeywordsRef.current.splice(0, recentSemanticKeywordsRef.current.length - MAX_SEMANTIC_KEYWORDS);
        }

        // Build combined keywords: baseline + quotes + recent semantic
        const semanticKws: SingleKeyword[] = recentSemanticKeywordsRef.current.map((s) => ({ keyword: s, matchCase: false }));
        const combined: SingleKeyword[] = [
          ...baselineKeywordsRef.current,
          ...quoteKeywordsRef.current,
          ...semanticKws,
        ];
        keywordsToApply = combined;
        // In merge mode, DO NOT clear highlights or circles
      } else if (isQuoteHighlight) {
        // Update persistent quote keywords (dedup + cap small)
        const incoming = (Array.isArray(reqKeywords) ? reqKeywords : [reqKeywords]) as SingleKeyword[];
        const map = new Map<string, SingleKeyword>();
        // existing
        quoteKeywordsRef.current.forEach((k) => map.set((k as any)?.keyword?.toLowerCase?.() || String(k).toLowerCase(), k));
        // add incoming
        incoming.forEach((k) => {
          const key = (k as any)?.keyword?.toLowerCase?.() || String(k).toLowerCase();
          if (!map.has(key)) map.set(key, k);
        });
        quoteKeywordsRef.current = Array.from(map.values()).slice(0, 10);

        const semanticKws: SingleKeyword[] = recentSemanticKeywordsRef.current.map((s) => ({ keyword: s, matchCase: false }));
        const combined: SingleKeyword[] = [
          ...baselineKeywordsRef.current,
          ...quoteKeywordsRef.current,
          ...semanticKws,
        ];
        keywordsToApply = combined;
        // In merge mode, DO NOT clear highlights or circles
      } else {
        // Replace baseline: clear previous highlights, and circles for non-quote operations
        if (searchPluginInstanceRef.current) {
          searchPluginInstanceRef.current.clearHighlights();
          console.log("🔍 PDF: Previous highlights cleared");
        }
        if (!isQuoteHighlight) {
          clearAllCircles();
          console.log("🔍 PDF: Previous circles cleared (new search operation)");
        } else {
          console.log("🔍 PDF: Keeping circles visible (quote highlighting)");
        }

        // Update baseline keywords unless this is a circle label search
        if (!isCircleSearch) {
          baselineKeywordsRef.current = Array.isArray(reqKeywords)
            ? (reqKeywords as SingleKeyword[])
            : [reqKeywords as SingleKeyword];
        }
      }

      // Small delay to ensure clearing is complete before applying new highlights
      await new Promise(resolve => setTimeout(resolve, 50));

      if (!searchPluginInstanceRef.current) {
        console.error("🔍 PDF: Search plugin instance not available");
        return;
      }
      
      // Limit plugin highlights: for semantic updates we only keep baseline/quotes
      const isSemantic = typeof requestId === 'string' && requestId.startsWith('semantic-');
      const pluginKeywords = (isSemantic || forceRefresh)
        ? ([...baselineKeywordsRef.current, ...quoteKeywordsRef.current] as any)
        : (keywordsToApply as any);
      const matches = await searchPluginInstanceRef.current.highlight(pluginKeywords);
      console.log("🔍 PDF: Real search results found:", matches.length, "matches");
      
      const results = matches.map((m, i) => {
        const text = m.pageText || '';
        const contextStart = Math.max(0, m.startIndex - 80);
        const contextEnd = Math.min(text.length, m.endIndex + 80);
        const excerpt = text.slice(contextStart, contextEnd);
        const matchedText = text.slice(m.startIndex, m.endIndex);
        
        console.log(`🔍 PDF: Match ${i + 1} on page ${m.pageIndex + 1}: "${matchedText}" (${m.startIndex}-${m.endIndex})`);
        
        return {
          pageIndex: m.pageIndex,
          page: m.pageIndex + 1,
          matchIndex: m.matchIndex,
          globalIndex: i,
          startIndex: m.startIndex,
          endIndex: m.endIndex,
          excerpt,
          matchedText,
        };
      });
      
      console.log("🔍 PDF: Processed real search results:", results.length, "total matches");
      // Persist only baseline + quote keywords so we don't accidentally re-expand
      // semantic phrases across entire pages during refreshes
      lastKeywordsRef.current = ([...baselineKeywordsRef.current, ...quoteKeywordsRef.current] as any);
      window.dispatchEvent(new CustomEvent('pdf-search-results', {
        detail: { requestId, results }
      }));

      // Re-apply active semantic overlays after highlights are applied to avoid
      // losing them during react-pdf-viewer DOM updates
      try {
        const isSemantic = typeof requestId === 'string' && requestId.startsWith('semantic-');
        if (isSemantic && activeSemanticOverlaysRef.current.length) {
          const overlays = [...activeSemanticOverlaysRef.current];
          setTimeout(() => {
            overlays.forEach((info) => {
              try {
                const layer = document.querySelector(`[data-testid=\"core__page-layer-${info.pageIndex}\"]`) as HTMLElement | null;
                if (!layer) return;
                const first = findTextRectInElement(layer, info.text);
                const second = !first ? findTextRectInElement(layer, info.text.replace(/-\s+/g, '').replace(/\s+/g, ' ')) : null;
                const found = first || second;
                if (found?.range) {
                  const sentence = expandRangeToSentence(found.range, layer);
                  drawRangeOverlays(info.pageIndex, sentence);
                }
              } catch {}
            });
          }, 10);
        }
      } catch {}
      
    } catch (err) {
      console.error('🔍 PDF: Search request failed', err);
      window.dispatchEvent(new CustomEvent('pdf-search-results', {
        detail: { requestId, results: [] }
      }));
    } finally {
      processingHighlightRef.current = false;
      // Process next item in queue after a small delay
      setTimeout(processHighlightQueue, 100);
    }
  };

  // Listen for search-related events from the agent/UI
  useEffect(() => {
    const handleSearchRequest = async (event: any) => {
      const requestId = event?.detail?.requestId;
      const reqKeywords = event?.detail?.keywords as SingleKeyword | SingleKeyword[];
      console.log("🔍 PDF: Search request received and queued:", { requestId, keywords: reqKeywords });
      console.log("🔍 PDF: Event detail:", event.detail);
      
      if (!reqKeywords) {
        console.warn("🔍 PDF: No keywords provided for search");
        return;
      }

      // Build robust variants for better matching (cross-line tolerant)
      const asArray = Array.isArray(reqKeywords) ? reqKeywords as any[] : [reqKeywords as any];
      const out: any[] = [];
      const seen = new Set<string>();
      const pushKw = (s: string) => {
        const key = s.toLowerCase();
        if (key && !seen.has(key)) { out.push({ keyword: s, matchCase: false }); seen.add(key); }
      };
      asArray.forEach((k) => {
        const term = typeof k === 'string' ? k : (k?.keyword ?? '');
        const normalized = normalizeQuery(String(term || ''));
        if (!normalized) return;
        // Prefer n-grams for long phrases
        const grams = buildNgrams(normalized, 3, 6, 4);
        if (grams.length) grams.forEach(g => buildHyphenVariants(g).forEach(pushKw));
        else buildHyphenVariants(normalized).forEach(pushKw);
      });
      // Add flexible regex variants that ignore newlines/soft hyphens for longer phrases
      const regexes: RegExp[] = [];
      for (const k of out) {
        const s = typeof k === 'string' ? k : (k?.keyword ?? '');
        if (typeof s === 'string' && s.trim().split(/\s+/).length >= 3) {
          try { regexes.push(buildFlexibleRegexFromPhrase(s)); } catch {}
        }
      }
      // Cap total entries to keep performance reasonable
      const finalKeywords: any[] = [...out.slice(0, 12), ...regexes.slice(0, 6)];

      // Add to queue instead of processing immediately (do not clear user highlights here; processor handles)
      highlightQueueRef.current.push({
        requestId,
        keywords: finalKeywords,
        timestamp: Date.now()
      });
      
      // Start processing queue
      processHighlightQueue();
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
      try { clearHighlightOverlays(); } catch {}
      try { activeSemanticOverlaysRef.current = []; } catch {}
      try { resetSemanticStepper(); } catch {}
      // Circles remain until explicitly cleared via 'tutor-annotations-clear'
      console.log("🔍 PDF: Cleared text highlights and overlays (circles preserved)");
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

  // Listen for active-section activation; set bounds for constrained semantic search
  useEffect(() => {
    const handler = (ev: any) => {
      const title = String(ev?.detail?.title || '').trim();
      if (!title) return;
      try {
        const outline: Array<{ title: string; pageIndex: number }> = (window as any).__pdfOutline || [];
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
        const match = outline.find((s) => normalize(s.title).includes(normalize(title)) || normalize(title).includes(normalize(s.title)));
        if (!match) return;
        const pageIndex = match.pageIndex;
        const layer = document.querySelector(`[data-testid="core__page-layer-${pageIndex}"]`) as HTMLElement | null;
        if (!layer) {
          // Defer until layer renders
          setTimeout(() => window.dispatchEvent(new CustomEvent('pdf-set-active-section', { detail: { title } })), 120);
          return;
        }
        // Find title rect and create a conservative page-bounded region below it
        const found = findTextRectInElement(layer, match.title) || findTextRectInElement(layer, title);
        const layerRect = layer.getBoundingClientRect();
        let bounds: { left: number; top: number; right: number; bottom: number } | undefined;
        if (found?.rect) {
          const localTop = Math.max(0, found.rect.top - layerRect.top);
          // Column-aware bounds: detect dominant column gap and clamp to the
          // column containing the section title so we never span both columns.
          const textEls = Array.from(layer.querySelectorAll('span, div')).filter((el) => (el.textContent || '').trim().length > 0);
          const positions = textEls.map((el) => (el.getBoundingClientRect().left - layerRect.left)).sort((a, b) => a - b);
          let columnBoundary = layerRect.width / 2;
          let maxGap = 0;
          for (let i = 1; i < positions.length; i++) {
            const gap = positions[i] - positions[i - 1];
            if (gap > maxGap && gap > 30) { maxGap = gap; columnBoundary = positions[i - 1] + gap / 2; }
          }
          const titleLeft = found.rect.left - layerRect.left;
          const isLeftColumn = titleLeft < columnBoundary;
          const margin = 12;
          const colStart = isLeftColumn ? margin : Math.max(margin, columnBoundary + 2);
          const colEnd = isLeftColumn ? Math.max(margin + 60, columnBoundary - 2) : layerRect.width - margin;
          const height = Math.max(240, Math.min(720, layerRect.height * 0.5));
          bounds = { left: colStart, top: localTop, right: colEnd, bottom: Math.min(layerRect.height - margin, localTop + height) };
        }
        (window as any).__activeSection = {
          title: match.title,
          page: pageIndex + 1,
          startPage: pageIndex + 1,
          endPage: pageIndex + 1,
          boundsByPage: bounds ? { [pageIndex]: bounds } : undefined
        };
        // Highlight only the title text
        const requestId = `section-title-${Date.now()}`;
        window.dispatchEvent(new CustomEvent('pdf-search-request', {
          detail: { requestId, keywords: [{ keyword: match.title, matchCase: false }] }
        }));
        try { scrollToPageIndex(pageIndex); } catch {}
      } catch {}
    };
    window.addEventListener('pdf-set-active-section', handler as EventListener);
    return () => window.removeEventListener('pdf-set-active-section', handler as EventListener);
  }, []);

  // Listen for requests to circle a table label (e.g., "Table 1") and highlight quotes
  useEffect(() => {
    // Function to get actual table boundaries from PDF structure
    const getTableBoundariesFromPDF = async (pageIndex: number, labelText: string) => {
      try {
        console.log(`🎯 Analyzing PDF structure for table: ${labelText} on page ${pageIndex + 1}`);
        
        // Access the PDF document from the viewer
        const pdfDoc = (window as any).__pdfDocument;
        if (!pdfDoc) {
          console.log('🎯 PDF document not available for structure analysis');
          return null;
        }
        
        const page = await pdfDoc.getPage(pageIndex + 1);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        
        // Find the label position in the text content
        let labelItem = null;
        let labelIndex = -1;
        
        for (let i = 0; i < textContent.items.length; i++) {
          const item = textContent.items[i];
          if (item.str && item.str.toLowerCase().includes(labelText.toLowerCase())) {
            labelItem = item;
            labelIndex = i;
            break;
          }
        }
        
        if (!labelItem) {
          console.log('🎯 Label not found in PDF text content');
          return null;
        }
        
        console.log(`🎯 Found label at index ${labelIndex}:`, labelItem);
        
        // Analyze items after the label to find table structure
        const tableItems = [];
        const labelY = labelItem.transform[5]; // Y coordinate
        const labelX = labelItem.transform[4]; // X coordinate
        
        // Look for structured content below the label - but be very precise
        let foundTableStart = false;
        let tableStartIndex = -1;
        
        for (let i = labelIndex + 1; i < textContent.items.length; i++) {
          const item = textContent.items[i];
          const itemY = item.transform[5];
          const itemX = item.transform[4];
          
          // Stop if we've moved too far down
          if (labelY - itemY > 400) break;
          
          // Look for the start of actual table data (layout-based, not content-based)
          if (!foundTableStart) {
            if (item.str) {
              // Heuristic: detect a "row" by finding multiple items with nearly identical Y within next items
              const currentY = itemY;
              let sameRowCount = 0;
              for (let j = i; j < Math.min(textContent.items.length, i + 20); j++) {
                const jItem = textContent.items[j];
                if (!jItem?.str) continue;
                const dy = Math.abs(currentY - jItem.transform[5]);
                if (dy <= 2.5) sameRowCount++;
              }
              if (sameRowCount >= 3) {
                foundTableStart = true;
                tableStartIndex = i;
                console.log(`🎯 Found table start (layout) at item ${i}: "${item.str}" with ${sameRowCount} items on row`);
              }
            }
            continue;
          }
          
          // Now collect only actual table data (generic heuristics)
          if (item.str) {
            const text = String(item.str).trim();
            const isShort = text.length > 0 && text.length <= 48;
            const hasDataChars = /[\d%]/.test(text);
            const fewWords = text.split(/\s+/).filter(Boolean).length <= 8;
            const looksCell = isShort && (hasDataChars || fewWords) && !(/[.!?]{2,}/.test(text));
            if (looksCell) {
              tableItems.push({
                text: item.str,
                x: itemX,
                y: itemY,
                width: item.width || 0,
                height: item.height || 0
              });
            }
          }
        }
        
        if (tableItems.length === 0) {
          console.log('🎯 No table items found after label');
          return null;
        }
        
        // Calculate actual table boundaries
        const minX = Math.min(labelX, ...tableItems.map(item => item.x));
        const maxX = Math.max(labelX + (labelItem.width || 0), ...tableItems.map(item => item.x + item.width));
        const minY = Math.min(labelY, ...tableItems.map(item => item.y));
        const maxY = Math.max(labelY, ...tableItems.map(item => item.y));
        
        console.log(`🎯 PDF structure analysis - Table bounds: ${minX}, ${minY} to ${maxX}, ${maxY}`);
        
        return {
          left: minX,
          top: maxY, // PDF coordinates are flipped
          right: maxX,
          bottom: minY,
          width: maxX - minX,
          height: labelY - minY // Height in PDF coordinates
        };
        
      } catch (error) {
        console.error('🎯 Error analyzing PDF structure:', error);
        return null;
      }
    };

    const circleByLabel = (label: string) => {
      console.log(`🎯 Circling label with PDF structure analysis: ${label}`);
      
      const requestId = `circle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const onResults = (e: any) => {
        if (e?.detail?.requestId !== requestId) return;
        window.removeEventListener('pdf-search-results', onResults as EventListener);
        const results = (e?.detail?.results || []) as Array<{ pageIndex: number; matchIndex: number }>;
        if (!results.length) {
          console.log(`🎯 No search results found for label: ${label}`);
          return;
        }
        
        const first = results[0];
        console.log(`🎯 Found label on page ${first.pageIndex + 1}, analyzing structure...`);
        
        setTimeout(async () => {
          try {
            const layer = document.querySelector(`[data-testid="core__page-layer-${first.pageIndex}"]`) as HTMLElement | null;
            if (!layer) {
              console.log(`🎯 Could not find page layer for page ${first.pageIndex}`);
              return;
            }

            // Proceed with DOM-based analysis only
            
            const hlEls = layer.querySelectorAll('.rpv-search__highlight');
            if (!hlEls || hlEls.length === 0) {
              console.log(`🎯 No highlight elements found for ${label}`);
              return;
            }
            
            console.log(`🎯 Found ${hlEls.length} highlight elements`);
            
            const layerRect = layer.getBoundingClientRect();
            let minLeft = Number.POSITIVE_INFINITY;
            let minTop = Number.POSITIVE_INFINITY;
            let maxRight = 0;
            let maxBottom = 0;
            
            // Get bounds of all highlighted elements (the label)
            hlEls.forEach((n) => {
              const r = (n as HTMLElement).getBoundingClientRect();
              minLeft = Math.min(minLeft, r.left);
              minTop = Math.min(minTop, r.top);
              maxRight = Math.max(maxRight, r.right);
              maxBottom = Math.max(maxBottom, r.bottom);
            });
            
            if (!isFinite(minLeft) || !isFinite(minTop)) return;
            
            // Convert to page-relative coordinates
            const labelLeft = minLeft - layerRect.left;
            const labelTop = minTop - layerRect.top;
            const labelWidth = maxRight - minLeft;
            const labelHeight = maxBottom - minTop;
            
            console.log(`🎯 Label bounds: ${labelLeft}, ${labelTop}, ${labelWidth}x${labelHeight}`);
            
            // Advanced content-aware circle positioning
            const isTable = /table/i.test(label);
            const isFigure = /figure/i.test(label);
            
            // Analyze content structure for 2-column layout
            const analyzeContentBounds = () => {
              // Get all text elements in the page layer
              const textElements = Array.from(layer.querySelectorAll('span, div')).filter(el => {
                const text = el.textContent?.trim();
                return text && text.length > 0;
              });
              
              if (textElements.length === 0) {
                console.log('🎯 No text elements found for content analysis');
                return null;
              }
              
              // Improved 2-column detection by analyzing actual text distribution
              const pageWidth = layerRect.width;
              
              // Analyze text distribution to find the actual column boundary
              const textPositions = textElements.map(el => {
                const rect = el.getBoundingClientRect();
                return rect.left - layerRect.left;
              }).sort((a, b) => a - b);
              
              // Find the gap between columns by looking for the largest horizontal gap
              let columnBoundary = pageWidth / 2; // Default fallback
              let maxGap = 0;
              
              for (let i = 1; i < textPositions.length; i++) {
                const gap = textPositions[i] - textPositions[i-1];
                if (gap > maxGap && gap > 30) { // Minimum gap of 30px to be considered column separator
                  maxGap = gap;
                  columnBoundary = textPositions[i-1] + gap / 2;
                }
              }
              
              // Determine which column the label is in based on detected boundary
              const isLeftColumn = labelLeft < columnBoundary;
              const columnStart = isLeftColumn ? 0 : columnBoundary;
              const columnEnd = isLeftColumn ? columnBoundary : pageWidth;
              
              console.log(`🎯 Detected column boundary at ${columnBoundary.toFixed(1)}px`);
              console.log(`🎯 Label in ${isLeftColumn ? 'LEFT' : 'RIGHT'} column (${columnStart.toFixed(1)}-${columnEnd.toFixed(1)})`);
              
              // Enhanced table/figure content detection for 2-column layout
              const contentElements = textElements.filter(el => {
                const rect = el.getBoundingClientRect();
                const elTop = rect.top - layerRect.top;
                const elLeft = rect.left - layerRect.left;
                const elRight = elLeft + rect.width;
                
                // Check if element is in the same column
                const elementInColumn = isLeftColumn ? 
                  (elLeft >= columnStart && elLeft < columnEnd) :
                  (elLeft >= columnStart && elLeft < layerRect.width);
                
                if (!elementInColumn) return false;
                
                // For tables, look for structured content (rows, cells, data)
                if (isTable) {
                  // Tables: look for content below the label (table rows/data)
                  const isBelow = elTop >= labelTop - 20; // Allow slight overlap
                  const horizontalOverlap = !(elRight < labelLeft - 100 || elLeft > labelLeft + labelWidth + 100);
                  
                  // Much more restrictive for tables - only include elements very close to the table
                  const isVeryClose = (elTop - labelTop) < 200; // Reduced from 500 to 200
                  const hasTableLikeContent = el.textContent && (
                    /\d/.test(el.textContent) || // Contains numbers (common in tables)
                    el.textContent.length < 50 || // Short text (table cells)
                    /[|─┌┐└┘├┤┬┴┼]/.test(el.textContent) // Table drawing characters
                  );
                  
                  return isBelow && horizontalOverlap && isVeryClose && hasTableLikeContent;
                } else if (isFigure) {
                  // Figures: look for content around the label (captions, figure content)
                  const verticalDistance = Math.abs(elTop - labelTop);
                  const horizontalDistance = Math.abs(elLeft - labelLeft);
                  
                  return verticalDistance < 300 && horizontalDistance < (pageWidth / 2) * 0.8;
                } else {
                  // Generic: nearby content
                  const verticalDistance = Math.abs(elTop - labelTop);
                  const horizontalDistance = Math.abs(elLeft - labelLeft);
                  
                  return verticalDistance < 200 && horizontalDistance < (pageWidth / 2) * 0.7;
                }
              });
              
              if (contentElements.length === 0) {
                console.log('🎯 No content elements found near label in same column');
                return null;
              }
              
              console.log(`🎯 Found ${contentElements.length} content elements in same column`);
              
              // For tables, try to find the actual table bottom boundary
              let tableBottomY = labelTop;
              if (isTable && contentElements.length > 0) {
                // Sort elements by vertical position to find table structure
                const sortedElements = contentElements
                  .map(el => {
                    const rect = el.getBoundingClientRect();
                    return {
                      element: el,
                      top: rect.top - layerRect.top,
                      bottom: rect.top - layerRect.top + rect.height,
                      left: rect.left - layerRect.left,
                      text: el.textContent?.trim() || ''
                    };
                  })
                  .sort((a, b) => a.top - b.top);
                
                // Look for table patterns: repeated horizontal structures, similar spacing
                const rowElements = [];
                let lastRowY = -1;
                const rowSpacing = [];
                
                for (const elem of sortedElements) {
                  if (elem.top > labelTop) { // Only consider elements below the label
                    if (lastRowY >= 0) {
                      const spacing = elem.top - lastRowY;
                      rowSpacing.push(spacing);
                    }
                    rowElements.push(elem);
                    lastRowY = elem.top;
                  }
                }
                
                // Find the consistent row spacing to detect table end
                if (rowSpacing.length > 1) {
                  const avgSpacing = rowSpacing.reduce((a, b) => a + b, 0) / rowSpacing.length;
                  const lastElement = rowElements[rowElements.length - 1];
                  
                  // Look for where spacing becomes inconsistent (table ends)
                  for (let i = rowSpacing.length - 1; i >= 0; i--) {
                    if (Math.abs(rowSpacing[i] - avgSpacing) > avgSpacing * 0.5) {
                      // Found inconsistent spacing - table likely ends here
                      tableBottomY = rowElements[i].bottom;
                      break;
                    }
                  }
                  
                  // If no inconsistency found, use the last element
                  if (tableBottomY === labelTop && lastElement) {
                    tableBottomY = lastElement.bottom;
                  }
                  
                  console.log(`🎯 Table analysis: avgSpacing=${avgSpacing.toFixed(1)}, tableBottom=${tableBottomY.toFixed(1)}`);
                }
              }
              
              // Calculate the bounding box of all related content within the column
              let minX = Number.POSITIVE_INFINITY;
              let minY = Number.POSITIVE_INFINITY;
              let maxX = 0;
              let maxY = 0;
              
              contentElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const elLeft = rect.left - layerRect.left;
                const elTop = rect.top - layerRect.top;
                const elRight = elLeft + rect.width;
                const elBottom = elTop + rect.height;
                
                minX = Math.min(minX, elLeft);
                minY = Math.min(minY, elTop);
                maxX = Math.max(maxX, elRight);
                maxY = Math.max(maxY, elBottom);
              });
              
              // For tables, use extremely precise table structure detection
              if (isTable) {
                // Find ONLY the actual table data rows, not surrounding text
                const tableElements = contentElements.filter(el => {
                  const text = el.textContent?.trim() || '';
                  const rect = el.getBoundingClientRect();
                  const elTop = rect.top - layerRect.top;
                  const elLeft = rect.left - layerRect.left;
                  
                  // Must be below the label
                  if (elTop <= labelTop) return false;
                  
                  // Must be in the same column (strict)
                  const columnMargin = 30; // Reduced margin for stricter column detection
                  const inSameColumn = Math.abs(elLeft - labelLeft) < columnMargin || 
                                     (elLeft >= columnStart && elLeft <= columnEnd);
                  
                  if (!inSameColumn) return false;
                  
                  // ONLY include elements that are likely table cells (generic heuristics)
                  return (
                    text.length > 0 &&
                    text.length <= 48 &&
                    (/[\d%]/.test(text) || text.split(/\s+/).filter(Boolean).length <= 6) &&
                    !(/[.!?]{2,}/.test(text))
                  );
                });
                
                if (tableElements.length > 0) {
                  // Sort by vertical position
                  const sortedElements = tableElements
                    .map(el => {
                      const rect = el.getBoundingClientRect();
                      return {
                        element: el,
                        top: rect.top - layerRect.top,
                        bottom: rect.bottom - layerRect.top,
                        text: el.textContent?.trim() || ''
                      };
                    })
                    .sort((a, b) => a.top - b.top);
                  
                  // Find the tightest bounds around actual table data
                  let tableStartY = sortedElements[0].top;
                  let tableEndY = sortedElements[sortedElements.length - 1].bottom;
                  
                  // Look for the first and last actual data rows (not headers)
                  let firstDataY = null;
                  let lastDataY = null;
                  
                  for (const elem of sortedElements) {
                    const isDataRow = /^\d+\.\d+$/.test(elem.text) || /^\d+\.\d+%$/.test(elem.text);
                    if (isDataRow) {
                      if (firstDataY === null) firstDataY = elem.top;
                      lastDataY = elem.bottom;
                    }
                  }
                  
                  // Use data row bounds if found, otherwise use all elements
                  if (firstDataY !== null && lastDataY !== null) {
                    tableStartY = firstDataY;
                    tableEndY = lastDataY;
                  }
                  
                  // Apply minimal padding - just enough to include the table
                  const padding = 20;
                  const finalTop = Math.max(labelTop, tableStartY - padding);
                  const finalBottom = tableEndY + padding;
                  
                  // Update the bounds to be much tighter
                  minY = Math.min(minY, finalTop);
                  maxY = Math.max(maxY, finalBottom);
                  
                  console.log(`🎯 Tight table bounds: ${finalTop} to ${finalBottom} (${sortedElements.length} elements)`);
                } else {
                  // If no table elements found, use a very conservative approach
                  const conservativeBottom = labelTop + 300; // Just 300px below label
                  maxY = Math.max(maxY, conservativeBottom);
                  console.log(`🎯 No table elements found, using conservative ${conservativeBottom}px below label`);
                }
              }
              
              // Include the original label in the bounds
              minX = Math.min(minX, labelLeft);
              minY = Math.min(minY, labelTop);
              maxX = Math.max(maxX, labelLeft + labelWidth);
              maxY = Math.max(maxY, labelTop + labelHeight);
              
              // Constrain to column boundaries
              minX = Math.max(columnStart + 10, minX);
              maxX = Math.min(columnEnd - 10, maxX);
              
              console.log(`🎯 2-column content analysis: ${minX}, ${minY} to ${maxX}, ${maxY}`);
              
              return {
                left: minX,
                top: minY,
                width: maxX - minX,
                height: maxY - minY,
                isLeftColumn
              };
            };
            
            const contentBounds = analyzeContentBounds();
            let circleLeft, circleTop, circleWidth, circleHeight;
            
            if (contentBounds) {
              // Use the analyzed content bounds with appropriate padding
              const padding = isTable ? 15 : isFigure ? 20 : 10;
              
              circleLeft = Math.max(0, contentBounds.left - padding);
              circleTop = Math.max(0, contentBounds.top - padding);
              circleWidth = Math.min(layerRect.width - circleLeft - padding, 
                                   contentBounds.width + padding * 2);
              circleHeight = Math.min(layerRect.height - circleTop - padding,
                                    contentBounds.height + padding * 2);
              
              console.log(`🎯 Using content-based bounds with ${padding}px padding`);
            } else {
              // Fallback to improved heuristic approach
              console.log('🎯 Using fallback heuristic approach');
              
              if (isTable) {
                // Tables: moderate width, extend down from label
                const padding = 20;
                circleLeft = Math.max(0, labelLeft - padding);
                circleTop = Math.max(0, labelTop - padding / 2);
                circleWidth = Math.min(layerRect.width - circleLeft - padding,
                                     Math.max(labelWidth + padding * 4, 300));
                circleHeight = Math.min(layerRect.height - circleTop - padding, 150);
              } else if (isFigure) {
                // Figures: more square, centered around label
                const padding = 25;
                const estimatedWidth = Math.max(labelWidth + padding * 4, 250);
                const estimatedHeight = Math.max(100, estimatedWidth * 0.7);
                
                circleLeft = Math.max(0, labelLeft - estimatedWidth / 4);
                circleTop = Math.max(0, labelTop - padding);
                circleWidth = Math.min(layerRect.width - circleLeft - padding, estimatedWidth);
                circleHeight = Math.min(layerRect.height - circleTop - padding, estimatedHeight);
              } else {
                // Generic: tight around label with minimal padding
                const padding = 15;
                circleLeft = Math.max(0, labelLeft - padding);
                circleTop = Math.max(0, labelTop - padding);
                circleWidth = Math.min(layerRect.width - circleLeft, labelWidth + padding * 2);
                circleHeight = Math.min(layerRect.height - circleTop, labelHeight + padding * 2);
              }
            }
            
            console.log(`🎯 Circle bounds: ${circleLeft}, ${circleTop}, ${circleWidth}x${circleHeight}`);
            
            drawCircleOnPage(first.pageIndex, {
              left: circleLeft,
              top: circleTop,
              width: circleWidth,
              height: circleHeight,
            });
            
            console.log(`🎯 Successfully circled ${label} on page ${first.pageIndex + 1}`);
          } catch (error) {
            console.error(`🎯 Error circling ${label}:`, error);
          }
        }, 120);
      };
      
      window.addEventListener('pdf-search-results', onResults as EventListener, { once: true });
      // Clear existing circles before creating new ones (but only for circle operations)
      try { clearAllCircles(); } catch {}
      
      // Enhanced search with multiple variations of the label
      const searchTerms = [label];
      
      // Add variations for better matching
      if (label.toLowerCase().includes('table')) {
        const num = label.match(/\d+/)?.[0];
        if (num) {
          searchTerms.push(`Table ${num}`);
          searchTerms.push(`table ${num}`);
          searchTerms.push(`TABLE ${num}`);
        }
      } else if (label.toLowerCase().includes('figure')) {
        const num = label.match(/\d+/)?.[0];
        if (num) {
          searchTerms.push(`Figure ${num}`);
          searchTerms.push(`figure ${num}`);
          searchTerms.push(`FIGURE ${num}`);
          searchTerms.push(`Fig. ${num}`);
          searchTerms.push(`fig. ${num}`);
        }
      }
      
      console.log(`🎯 Searching for label variations:`, searchTerms);
      
      window.dispatchEvent(new CustomEvent('pdf-search-request', {
        detail: { requestId, keywords: searchTerms }
      }));
    };

    // Precise content highlighting function
    const highlightContentPrecise = (content: string, page?: number) => {
      console.log(`🎯 PDF: Precise content highlighting for: "${content}"`);
      
      const requestId = `content-highlight-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const onResults = (e: any) => {
        if (e?.detail?.requestId !== requestId) return;
        window.removeEventListener('pdf-search-results', onResults as EventListener);
        const results = (e?.detail?.results || []) as Array<{ pageIndex: number; matchIndex: number }>;
        if (!results.length) {
          console.log(`🎯 No search results found for content: ${content}`);
          return;
        }
        
        // Find the first match and highlight it precisely
        const first = results[0];
        setTimeout(async () => {
          try {
            const layer = document.querySelector(`[data-testid="core__page-layer-${first.pageIndex}"]`) as HTMLElement | null;
            if (!layer) return;
            
            // Wait for highlights to be rendered
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Find the highlight element for this specific match
            const highlights = layer.querySelectorAll('.rpv-search__highlight');
            if (highlights.length === 0) return;
            
            // Use the first highlight (most relevant match)
            const highlight = highlights[0] as HTMLElement;
            const rect = highlight.getBoundingClientRect();
            const layerRect = layer.getBoundingClientRect();
            
            // Calculate precise bounds relative to the page
            const bounds = {
              left: rect.left - layerRect.left,
              top: rect.top - layerRect.top,
              width: rect.width,
              height: rect.height
            };
            
            console.log(`🎯 Precise content bounds:`, bounds);
            
            // Draw a precise circle around the content
            drawCircleOnPage(first.pageIndex, bounds);
            
            // Scroll to the highlighted content
            try { scrollToPageIndex(first.pageIndex); } catch {}
            
          } catch (error) {
            console.error('🎯 Precise content highlighting error:', error);
          }
        }, 100);
      };
      
      window.addEventListener('pdf-search-results', onResults as EventListener);
      window.dispatchEvent(new CustomEvent('pdf-search-request', { 
        detail: { 
          requestId,
          keywords: [{ keyword: content, matchCase: false }]
        } 
      }));
    };

    // Handle quote highlighting from TutorAgent
    const handleHighlightContentOCR = (event: any) => {
      const { content, page } = event.detail || {};
      console.log('🎯 PDF: Received OCR content highlight request:', { content, page });
      console.log('🎯 PDF: Full event detail:', event.detail);
      
      if (!content || typeof content !== 'string') {
        console.warn('🎯 PDF: Invalid content text:', content);
        return;
      }

      // Use precise content highlighting instead of broad OCR detection
      highlightContentPrecise(content, page);
    };

    const handleHighlightQuote = (event: any) => {
      const { text, page } = event.detail || {};
      console.log('🎯 PDF: Received highlight quote request:', { text, page });
      console.log('🎯 PDF: Full event detail:', event.detail);
      
      if (!text || typeof text !== 'string') {
        console.warn('🎯 PDF: Invalid quote text:', text);
        return;
      }

      // Use the search functionality to highlight the quote
      const requestId = `quote-highlight-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // Don't clear circles for quote highlighting - they can coexist
      // clearAllCircles(); // Removed - let circles stay visible with quotes
      console.log('🎯 PDF: Keeping circles visible during quote highlighting');
      
      // Phrase-only highlighting to avoid tiny token matches
      const phrase = String(text || '').replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
      const keywordObjects: Array<{ keyword: string; matchCase: boolean }> = phrase ? [{ keyword: phrase, matchCase: false }] : [];

      // Add to highlight queue; merge mode handled in processor
      highlightQueueRef.current.push({
        requestId,
        keywords: keywordObjects,
        timestamp: Date.now()
      });
      
      // Process the queue
      processHighlightQueue();

      // If page is specified, navigate to that page
      if (typeof page === 'number' && page > 0) {
        const zeroBased = page - 1;
        try {
          if ((window as any).pdfJumpToPage) {
            (window as any).pdfJumpToPage(page);
          } else {
            window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: zeroBased } }));
          }
        } catch (err) {
          console.warn('🎯 PDF: Failed to navigate to page:', err);
        }
      }
    };

    const handleCircleTable = async (event: any) => {
      const label = String(event?.detail?.label || '').trim();
      console.log(`🎯 Table Detection: Starting analysis for ${label}`);
      
      try {
        // Clear any existing circles
        try { clearAllCircles(); } catch {}

        // Find the page with the table using multiple variants
        const requestId = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const variants: Array<{ keyword: string; matchCase: boolean }> = [{ keyword: label, matchCase: false }];
        const num = label.match(/\d+/)?.[0];
        if (/table/i.test(label) && num) {
          variants.push(
            { keyword: `Table ${num}`, matchCase: false },
            { keyword: `table ${num}`, matchCase: false },
            { keyword: `TABLE ${num}`, matchCase: false }
          );
        }

        const onResults = (e: any) => {
          if (e?.detail?.requestId !== requestId) return;
          window.removeEventListener('pdf-search-results', onResults as EventListener);
          const results = (e?.detail?.results || []) as Array<{ pageIndex: number; matchIndex: number }>;
          if (!results.length) {
            console.log(`🎯 No search results found for label: ${label}`);
            return;
          }
          
          // Always take the first match for deterministic behavior
          const first = results[0];
          console.log(`🎯 Found label on page ${first.pageIndex + 1}, match ${first.matchIndex}, starting OCR analysis...`);
          
          // Ensure the matched page is rendered before OCR
          try {
            try { pageNavigationPluginInstance.jumpToPage(first.pageIndex); } catch {}
            try { scrollToPageIndex(first.pageIndex); } catch {}
          } catch {}

          (async () => {
            const layer = await waitForPageLayer(first.pageIndex, 20, 150);
            if (!layer) {
              console.log('🎯 Page layer not ready for OCR; falling back to DOM analysis');
              try { circleByLabel(label); } catch {}
              return;
            }
            
            // Wait for text layer to be fully rendered
            await new Promise(resolve => setTimeout(resolve, 200));
            
            try {
              // Use the TOP-MOST label highlight as OCR anchor (avoid merging across columns)
              const hlEls = Array.from(layer.querySelectorAll('.rpv-search__highlight')) as HTMLElement[];
              let anchor: { left: number; top: number; width: number; height: number } | undefined;
              if (hlEls && hlEls.length > 0) {
                const layerRect = layer.getBoundingClientRect();
                const topMost = hlEls
                  .map((el) => ({ el, rect: el.getBoundingClientRect() }))
                  .sort((a, b) => a.rect.top - b.rect.top)[0];
                if (topMost) {
                  anchor = {
                    left: topMost.rect.left - layerRect.left,
                    top: topMost.rect.top - layerRect.top,
                    width: Math.max(1, topMost.rect.width),
                    height: Math.max(1, topMost.rect.height),
                  };
                }
                console.log(`🎯 OCR anchor (top-most) for ${label}:`, anchor);
              }
              // Fallback: try direct text search for the label in the layer
              if (!anchor) {
                const hit = findTextRectInElement(layer, label);
                if (hit?.rect) {
                  const layerRect = layer.getBoundingClientRect();
                  anchor = {
                    left: hit.rect.left - layerRect.left,
                    top: hit.rect.top - layerRect.top,
                    width: hit.rect.width,
                    height: hit.rect.height,
                  };
                }
              }

              const bounds = await ocrDetectTableBoundsFromLayer(layer, anchor);
              console.log(`🎯 OCR bounds for ${label}:`, bounds);
              if (bounds && bounds.width > 0 && bounds.height > 0) {
                drawCircleOnPage(first.pageIndex, bounds);
                try { scrollToPageIndex(first.pageIndex); } catch {}
              } else {
                console.log('🎯 OCR returned invalid bounds; using column-aware anchor fallback');
                if (anchor) {
                  const layerRect = layer.getBoundingClientRect();
                  // Detect column boundary and clamp width to the anchor's column
                  const textEls = Array.from(layer.querySelectorAll('span, div')).filter((el) => (el.textContent || '').trim().length > 0);
                  const positions = textEls.map((el) => (el.getBoundingClientRect().left - layerRect.left)).sort((a, b) => a - b);
                  let columnBoundary = layerRect.width / 2; let maxGap = 0;
                  for (let i = 1; i < positions.length; i++) { const gap = positions[i] - positions[i - 1]; if (gap > maxGap && gap > 30) { maxGap = gap; columnBoundary = positions[i - 1] + gap / 2; } }
                  const isLeftColumn = anchor.left < columnBoundary;
                  const colEnd = isLeftColumn ? Math.max(80, columnBoundary - 2) : layerRect.width - 12;
                  const margin = 12;
                  const width = Math.max(120, Math.min(colEnd - anchor.left - margin, Math.max(anchor.width * 2.2, 180)));
                  const height = Math.max(160, Math.min(360, layerRect.height * 0.35));
                  const fallbackBounds = {
                    left: anchor.left,
                    top: Math.min(layerRect.height - height - margin, anchor.top + anchor.height + 8),
                    width,
                    height,
                  };
                  drawCircleOnPage(first.pageIndex, fallbackBounds);
                  try { scrollToPageIndex(first.pageIndex); } catch {}
                } else {
                  console.log('🎯 No anchor available; falling back to DOM analysis');
                  try { circleByLabel(label); } catch {}
                }
              }
            } catch (error) {
              console.error('🎯 OCR error:', error);
              try { circleByLabel(label); } catch {}
            }
          })();
        };
        
        window.addEventListener('pdf-search-results', onResults as EventListener);
        window.dispatchEvent(new CustomEvent('pdf-search-request', { 
          detail: { 
            requestId,
            keywords: variants
          } 
        }));
        
      } catch (error) {
        console.error('🎯 Table Detection Error:', error);
        // Fallback to old method if OCR fails
        circleByLabel(label);
      }
    };

    // Removed in-effect OCR duplicate; uses shared utils via performOCRTableDetection above

    const handleCircleFigure = (event: any) => {
      const label = String(event?.detail?.label || '').trim() || 'Figure 1';
      circleByLabel(label);
    };
    
    const handleCircleSection = (event: any) => {
      const { sectionTitle, pageIndex, term } = event.detail || {};
      console.log(`🎯 Circling entire section: "${sectionTitle}" on page ${pageIndex + 1}`);
      
      // Navigate to the section page first
      try {
        if ((window as any).pdfJumpToPage) {
          (window as any).pdfJumpToPage(pageIndex + 1);
        } else {
          window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: pageIndex } }));
        }
      } catch {}
      
      // Wait for page to load, then circle the entire section using OCR
      setTimeout(async () => {
        try {
          // Clear all existing highlights and circles first
          try { clearAllCircles(); } catch {}
          try {
            if (searchPluginInstanceRef.current) {
              searchPluginInstanceRef.current.clearHighlights();
            }
          } catch {}
          
          const layer = await waitForPageLayer(pageIndex, 20, 150);
          if (!layer) {
            console.log('🎯 Page layer not ready for section circling');
            return;
          }
          
          // Find the section TITLE (not the first occurrence of the term)
          // Strategy:
          // 1) Prefer a numbered heading like "3.2 Inter-Head Gating"
          // 2) Otherwise exact title match
          // 3) Constrain to elements near the top portion of the page
          const layerRect = layer.getBoundingClientRect();
          const maxTop = layerRect.top + layerRect.height * 0.35; // heading should be near top third
          const wantedTitle = (sectionTitle || '').trim();
          const wantedLc = wantedTitle.toLowerCase();
          // Require a numbered heading (e.g., "3.2 Inter-Head Gating"), optional trailing dot after number
          // Hyphen and space are considered equivalent inside the title tokens
          const titlePattern = wantedLc.replace(/[-\s]+/g, '[-\\s]+');
          const headingRegex = new RegExp(`^\\s*\\d+(?:\\.\\d+)*\\.?\\s+${titlePattern}\b`, 'i');

          let candidates = Array.from(layer.querySelectorAll('span, div')).filter(el => {
            const text = (el.textContent || '').trim();
            if (!text) return false;
            const rect = el.getBoundingClientRect();
            // Must be in top third of page
            if (rect.top > maxTop) return false;
            // Match numbered heading or exact title
            if (headingRegex.test(text)) return true;
            return false;
          });

          // Fallback: if not found near top (e.g., subsection appears mid/low page), scan full page
          if (candidates.length === 0) {
            candidates = Array.from(layer.querySelectorAll('span, div')).filter(el => {
              const text = (el.textContent || '').trim();
              if (!text) return false;
              return headingRegex.test(text);
            });
          }
          
          if (candidates.length > 0) {
            // Choose the highest title-like element (closest to top)
            const titleEl = candidates.sort((a,b)=>a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] as HTMLElement;
            const titleRect = titleEl.getBoundingClientRect();
            
            // Calculate section boundaries based on the title position
            const sectionBounds = {
              left: Math.max(0, titleRect.left - layerRect.left - 20),
              top: Math.max(0, titleRect.top - layerRect.top - 20),
              width: Math.min(layerRect.width - 40, layerRect.width - (titleRect.left - layerRect.left) + 20),
              height: Math.min(400, layerRect.height - (titleRect.top - layerRect.top) + 20) // Cover most of the section
            };
            
            drawCircleOnPage(pageIndex, sectionBounds);
            try { scrollToPageIndex(pageIndex); } catch {}
            // Persist active section context for current and next page
            try {
              const boundsForPage = {
                left: sectionBounds.left,
                top: sectionBounds.top,
                right: sectionBounds.left + sectionBounds.width,
                bottom: sectionBounds.top + sectionBounds.height,
              };
              const approxNextPageBounds = {
                left: 10,
                top: 20,
                right: layerRect.width - 10,
                bottom: layerRect.height - 40,
              };
              (window as any).__activeSection = {
                title: sectionTitle,
                startPage: pageIndex + 1,
                endPage: pageIndex + 2,
                boundsByPage: {
                  [pageIndex]: boundsForPage,
                  [pageIndex + 1]: approxNextPageBounds,
                },
              };
            } catch {}
            console.log(`🎯 Circled entire section "${sectionTitle}" with bounds:`, sectionBounds);
          } else {
            console.log('🎯 Could not find section title, using full page area');
            // Fallback: circle a large area of the page
            const layerRect = layer.getBoundingClientRect();
            const sectionBounds = {
              left: 20,
              top: 50,
              width: layerRect.width - 40,
              height: Math.min(500, layerRect.height - 100)
            };
            drawCircleOnPage(pageIndex, sectionBounds);
            // Persist active section even on fallback bounds
            try {
              (window as any).__activeSection = {
                title: sectionTitle,
                startPage: pageIndex + 1,
                endPage: pageIndex + 2,
                boundsByPage: {
                  [pageIndex]: {
                    left: sectionBounds.left,
                    top: sectionBounds.top,
                    right: sectionBounds.left + sectionBounds.width,
                    bottom: sectionBounds.top + sectionBounds.height,
                  },
                },
              };
            } catch {}
          }
        } catch (error) {
          console.error('🎯 Error circling section:', error);
        }
      }, 500); // Give more time for page to load
    };
    
    const handleClearAnnotations = () => clearAllCircles();

    window.addEventListener('tutor-circle-table', handleCircleTable as EventListener);
    window.addEventListener('tutor-circle-figure', handleCircleFigure as EventListener);
    window.addEventListener('tutor-circle-section', handleCircleSection as EventListener);
    window.addEventListener('tutor-annotations-clear', handleClearAnnotations as EventListener);
    window.addEventListener('tutor-highlight-quote', handleHighlightQuote as EventListener);
    window.addEventListener('tutor-highlight-content-ocr', handleHighlightContentOCR as EventListener);
    
  // Handle semantic fragment highlighting
  const handleSemanticFragment = (event: any) => {
      const { text, page, similarity, query, chunkId, startIndex, endIndex, keywords: incomingKeywords } = event.detail || {};
      console.log(`🎯 Received semantic fragment event:`, { text: text?.substring(0, 50), similarity, query, chunkId });

      // Dedupe: skip if identical semantic target as last
      (handleSemanticFragment as any)._lastSemId = (handleSemanticFragment as any)._lastSemId || null;

      // Dedup guard: skip if same normalized text arrived very recently
      const normalizedNow = String(text || '')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      (window as any).__lastSemanticText = (window as any).__lastSemanticText || '';
      (window as any).__lastSemanticTs = (window as any).__lastSemanticTs || 0;
      (window as any).__lastSemanticApplyTs = (window as any).__lastSemanticApplyTs || 0;
      const lastTxt: string = (window as any).__lastSemanticText;
      const lastTs: number = Number((window as any).__lastSemanticTs) || 0;
      const nowMs = Date.now();
      const isDuplicate = normalizedNow && lastTxt && normalizedNow.toLowerCase() === lastTxt.toLowerCase();
      const within300ms = nowMs - lastTs < Math.min(semanticPaceRef.current.dwellMs / 3, 400);
      if (isDuplicate && within300ms) {
        console.log('🎯 Skipping duplicate semantic fragment within 300ms');
        return;
      }
      (window as any).__lastSemanticText = normalizedNow;
      (window as any).__lastSemanticTs = nowMs;
      
      if (text && (typeof similarity !== 'number' || similarity >= 0.3)) {
        console.log(`🎯 Highlighting semantic fragment (${similarity.toFixed(2)} similarity):`, text.substring(0, 50) + '...');
        
        // Use the existing highlight system; PHRASE-ONLY to avoid short token matches; MERGE with existing highlights
        const requestId = `semantic-fragment-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const normalized = String(text || '')
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/\s+/g, ' ')
          .trim();

        // Build tokens only for overlay fallbacks (we won't highlight tokens)
        const stop = new Set(['the','and','for','with','this','that','from','into','onto','over','very','more','most','such','than','then','also','can','may','might','will','would','could','been','have','has','had','each','both','about','above','below']);
        const tokens = normalized.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
          .filter((w) => w.length > 3 && !stop.has(w));
        const uniq: string[] = [];
        for (const w of tokens) { if (!uniq.includes(w)) uniq.push(w); }
        const tokenSubset = uniq.slice(0, 5);

        // Phrase-only highlighting to avoid title-token matches
        const extra = Array.isArray(incomingKeywords) ? incomingKeywords.filter(Boolean) : [];
        const phrase = normalized;
        const wordCount = phrase.split(/\s+/).filter(Boolean).length;
        if (wordCount < 2 || phrase.length < 12) {
          console.log('🎯 Skipping too-short semantic phrase');
          return;
        }
        const keywordObjects: Array<{ keyword: string; matchCase: boolean }> = [{ keyword: phrase, matchCase: false }];

        // Compute a semantic-id to detect repeats and reset between utterances
        const semId = String(chunkId || `${page || 'P'}`);
        (handleSemanticFragment as any)._lastSemId = semId;

        // Pace updates: enforce minimum dwell between applied highlights
        const lastApply: number = Number((window as any).__lastSemanticApplyTs) || 0;
        const minDwell = semanticPaceRef.current.dwellMs;
        if ((nowMs - lastApply < minDwell) || !audioGateOpenRef.current) {
          console.log('🎯 Pacing semantic highlight (too soon)');
          return;
        }
        audioGateOpenRef.current = false;
        (window as any).__lastSemanticApplyTs = nowMs;

        // Do not clear overlays between fragments; allow semantic overlays
        // to accumulate until the next utterance begins

        // Immediate sentence overlay attempt within the active section (can span pages)
        try {
          let targetIndex: number | null = null;
          // 1) Prefer pages from current lexical context (search_document)
          try {
            const s: any = (window as any).__pdfSearchState;
            if (s && Array.isArray(s.steps) && s.steps.length > 0) {
              const pages = s.steps.map((st: any) => st.pageIndex).filter((p: any) => typeof p === 'number');
              const set = new Set<number>(pages);
              if (typeof page === 'number' && page > 0 && set.has(page - 1)) {
                targetIndex = page - 1;
              } else {
                const cur = typeof s.currentIndex === 'number' ? s.currentIndex : 0;
                targetIndex = pages[cur] ?? pages[0] ?? null;
              }
            }
          } catch {}
          // 2) If not in context, but page is provided, use it
          if (targetIndex === null && typeof page === 'number' && page > 0) {
            targetIndex = page - 1;
          }
          // 3) Build candidate page indices constrained to the active section (to handle sections spanning pages)
          const candidates: number[] = [];
          if (targetIndex !== null && targetIndex >= 0) candidates.push(targetIndex);
          try {
            const active: any = (window as any).__activeSection;
            if (active) {
              const start = Number(active.startPage ?? active.page ?? active.start ?? 1) - 1;
              const end = Number(active.endPage ?? active.page ?? active.end ?? start + 1) - 1;
              for (let i = Math.max(0, start); i <= Math.max(start, end); i++) {
                if (!candidates.includes(i)) candidates.push(i);
              }
            } else if (targetIndex !== null) {
              // Also consider the immediate next page to catch split sections
              if (!candidates.includes(targetIndex + 1)) candidates.push(targetIndex + 1);
            }
          } catch {}

          // 4) Try each candidate page until we find a match
          for (const candidate of candidates) {
            if (candidate == null || candidate < 0) continue;
            const layer = document.querySelector(`[data-testid=\"core__page-layer-${candidate}\"]`) as HTMLElement | null;
            if (!layer) {
              // Ensure the page is rendered, then try again shortly
              try { pageNavigationPluginInstance.jumpToPage(candidate); } catch {}
              try { scrollToPageIndex(candidate); } catch {}
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('tutor-highlight-semantic-fragment', { detail: { text, page: candidate + 1, similarity, query: incomingKeywords?.[0]?.keyword || '', chunkId } }));
              }, 180);
              continue;
            }
            {
              // Constrain matches to active section bounds on this page if known
              let clip: { left: number; top: number; right: number; bottom: number } | undefined = undefined;
              try {
                const active: any = (window as any).__activeSection;
                if (active && active.boundsByPage && active.boundsByPage[candidate]) {
                  clip = active.boundsByPage[candidate];
                }
              } catch {}
              // 1) Try full phrase
              const firstTry = findTextRectInElement(layer, normalized, clip);
              const secondTry = !firstTry ? findTextRectInElement(layer, normalized.replace(/-\s+/g, '').replace(/\s+/g, ' '), clip) : null;
              const found = firstTry || secondTry;
              if (found?.range) {
                const sentence = expandRangeToSentence(found.range, layer);
                drawRangeOverlays(candidate, sentence);
                try {
                  const entry = { text: normalized, pageIndex: candidate, ts: Date.now() };
                  const list = activeSemanticOverlaysRef.current;
                  // de-dup by text+page
                  const key = (e: any) => `${e.pageIndex}|${e.text.toLowerCase()}`;
                  const existsIdx = list.findIndex((e) => key(e) === key(entry));
                  if (existsIdx >= 0) list.splice(existsIdx, 1);
                  list.push(entry);
                  // cap list size
                  if (list.length > 8) list.splice(0, list.length - 8);
                } catch {}
                // Build word map inside sentence bounds for progressive highlighting
                try {
                  const sRect = sentence.getBoundingClientRect();
                  const rects = collectWordRectsInArea(layer, sRect);
                  const words = normalized.split(/\s+/).filter(Boolean);
                  semanticStepperRef.current = {
                    pageIndex: candidate,
                    words,
                    rects,
                    idx: 0,
                    lastStepMs: performance.now() - semanticPaceRef.current.dwellMs,
                  };
                } catch {}
                break; // done
              } else {
                // 2) Build a composite range from multiple strong tokens
                const tokenRanges: { range: Range; rect: DOMRect }[] = [];
                for (const t of tokenSubset.slice(0, 4)) {
                  const hit = findTextRectInElement(layer, t);
                  if (hit?.range) tokenRanges.push(hit);
                }
                if (tokenRanges.length >= 2) {
                  // Create a range spanning from first to last token on page
                  const start = tokenRanges[0].range.cloneRange();
                  const end = tokenRanges[tokenRanges.length - 1].range.cloneRange();
                  const span = document.createRange();
                  span.setStart(start.startContainer, start.startOffset);
                  span.setEnd(end.endContainer, end.endOffset);
                  const sentence = expandRangeToSentence(span, layer);
                  drawRangeOverlays(candidate, sentence);
                  try {
                    const entry = { text: normalized, pageIndex: candidate, ts: Date.now() };
                    const list = activeSemanticOverlaysRef.current;
                    const key = (e: any) => `${e.pageIndex}|${e.text.toLowerCase()}`;
                    const existsIdx = list.findIndex((e) => key(e) === key(entry));
                    if (existsIdx >= 0) list.splice(existsIdx, 1);
                    list.push(entry);
                    if (list.length > 8) list.splice(0, list.length - 8);
                  } catch {}
                  break; // done
                } else if (tokenRanges.length === 1) {
                  // Expand single token to sentence
                  const sentence = expandRangeToSentence(tokenRanges[0].range, layer);
                  drawRangeOverlays(candidate, sentence);
                  try {
                    const entry = { text: normalized, pageIndex: candidate, ts: Date.now() };
                    const list = activeSemanticOverlaysRef.current;
                    const key = (e: any) => `${e.pageIndex}|${e.text.toLowerCase()}`;
                    const existsIdx = list.findIndex((e) => key(e) === key(entry));
                    if (existsIdx >= 0) list.splice(existsIdx, 1);
                    list.push(entry);
                    if (list.length > 8) list.splice(0, list.length - 8);
                  } catch {}
                  break; // done
                }
              }
            }
          }
        } catch {}

        // Also push phrase into native search accumulation without clearing
        try {
          // Track this phrase in the sliding window FIRST
          const exists = recentSemanticKeywordsRef.current.find((x) => x.toLowerCase() === normalized.toLowerCase());
          if (!exists) recentSemanticKeywordsRef.current.push(normalized);
          if (recentSemanticKeywordsRef.current.length > MAX_SEMANTIC_KEYWORDS) {
            recentSemanticKeywordsRef.current.splice(0, recentSemanticKeywordsRef.current.length - MAX_SEMANTIC_KEYWORDS);
          }
          const mergedKeywords = [
            ...baselineKeywordsRef.current,
            ...quoteKeywordsRef.current,
            // Push both exact-phrase keywords and flexible regexes so newlines are ignored
            ...recentSemanticKeywordsRef.current.map(s => ({ keyword: s, matchCase: false })),
            ...recentSemanticKeywordsRef.current.map(s => buildFlexibleRegexFromPhrase(s)),
          ];
          highlightQueueRef.current.push({
            requestId: `semantic-accum-${Date.now()}`,
            keywords: mergedKeywords,
            timestamp: Date.now(),
            forceRefresh: true,
          });
          processHighlightQueue();
        } catch {}
      } else {
        console.log(`🎯 Skipping semantic fragment (similarity ${similarity?.toFixed(2)} too low or no text)`);
      }
    };
    
    window.addEventListener('tutor-highlight-semantic-fragment', handleSemanticFragment as EventListener);
    
    return () => {
      window.removeEventListener('tutor-circle-table', handleCircleTable as EventListener);
      window.removeEventListener('tutor-circle-figure', handleCircleFigure as EventListener);
      window.removeEventListener('tutor-circle-section', handleCircleSection as EventListener);
      window.removeEventListener('tutor-annotations-clear', handleClearAnnotations as EventListener);
      window.removeEventListener('tutor-highlight-quote', handleHighlightQuote as EventListener);
      window.removeEventListener('tutor-highlight-content-ocr', handleHighlightContentOCR as EventListener);
      window.removeEventListener('tutor-highlight-semantic-fragment', handleSemanticFragment as EventListener);
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
        // Also clear circles when clearing all highlights
        clearAllCircles();
        console.log("🔍 PDF: Cleared highlights and circles due to no keywords");
      } catch {}
    }
  }, [lastKeywordsRef.current]);

  useEffect(() => {
    // Clear semantic overlays and stepper when a full transcript item arrives,
    // not at utterance boundaries. Keeps highlights during multi-utterance items.
    const handleTranscriptItem = () => {
      try {
        // Preserve baseline (e.g., section title) and quote highlights.
        // Only reset semantic overlays/stepper and recent semantic phrases.
        try { clearHighlightOverlays(); } catch {}
        resetSemanticStepper();
        recentSemanticKeywordsRef.current = [];

        // Re-apply current baseline + quotes to ensure persistence
        const refreshKeywords = [
          ...baselineKeywordsRef.current,
          ...quoteKeywordsRef.current,
        ];
        highlightQueueRef.current.push({
          requestId: `semantic-refresh-${Date.now()}`,
          keywords: refreshKeywords,
          timestamp: Date.now(),
          forceRefresh: true,
        });
        processHighlightQueue();
        console.log('🔄 Transcript item: preserved baseline/quotes and reset semantic state');
      } catch {}
    };

    window.addEventListener('tutor-transcript-item', handleTranscriptItem as EventListener);
    return () => window.removeEventListener('tutor-transcript-item', handleTranscriptItem as EventListener);
  }, []);

  // Global pacing config for semantic highlights (updated via tutor-audio-pace)
  const semanticPaceRef = useRef<{ dwellMs: number }>({ dwellMs: 900 });

  useEffect(() => {
    const handlePace = (ev: any) => {
      const dwell = Number(ev?.detail?.dwellMs);
      if (isFinite(dwell) && dwell > 300 && dwell < 3000) {
        semanticPaceRef.current.dwellMs = dwell;
        console.log('🎯 Updated semantic dwellMs to', dwell);
      }
    };
    window.addEventListener('tutor-audio-pace', handlePace as EventListener);
    return () => window.removeEventListener('tutor-audio-pace', handlePace as EventListener);
  }, []);

  const lastAudioTickRef = useRef<number>(0);
  const audioGateOpenRef = useRef<boolean>(true);
  useEffect(() => {
    const onTick = (ev: any) => {
      const t = Number(ev?.detail?.t) || 0;
      const now = performance.now();
      // Open gate if enough time passed based on dwell
      if (now - lastAudioTickRef.current >= semanticPaceRef.current.dwellMs) {
        audioGateOpenRef.current = true;
        lastAudioTickRef.current = now;
      }
      // drive semantic stepper
      try { advanceSemanticWord(); } catch {}
    };
    const onPace = (ev: any) => {
      if (ev?.detail?.paused) {
        audioGateOpenRef.current = false;
      } else {
        audioGateOpenRef.current = true;
      }
    };
    window.addEventListener('tutor-audio-tick', onTick as EventListener);
    window.addEventListener('tutor-audio-pace', onPace as EventListener);
    return () => {
      window.removeEventListener('tutor-audio-tick', onTick as EventListener);
      window.removeEventListener('tutor-audio-pace', onPace as EventListener);
    };
  }, []);

  return (
    <div ref={rootRef} className="w-full h-full">
      <style>{`
        /* Simple circle styling only */
        .tutor-circle-annotation {
          border: 3px solid #ef4444 !important;
          box-shadow: 0 0 0 2px rgba(239,68,68,0.25) !important;
        }
        .tutor-search-overlay { position: absolute; right: 16px; top: 16px; z-index: 10000; background: rgba(255,255,255,0.96); border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 6px 18px rgba(0,0,0,0.08); padding: 10px; display: flex; align-items: center; gap: 8px; }
        .tutor-search-input { width: 320px; outline: none; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px; font-size: 14px; }
        .tutor-search-btn { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
        .tutor-search-btn:hover { background: #e5e7eb; }
        .tutor-search-counter { font-size: 12px; color: #475569; min-width: 58px; text-align: center; }
      `}</style>
      {/* In-view search overlay to support Cmd/Ctrl+F with sentence search across line breaks */}
      {showSearchOverlay && (
        <div className="tutor-search-overlay" onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (e.shiftKey) jumpToPrev(); else jumpToNext();
          }
        }}>
          <input
            ref={searchInputRef}
            className="tutor-search-input"
            placeholder="Search in PDF..."
            value={searchValue}
            onChange={(e) => { setSearchValue(e.target.value); runSearch(e.target.value); }}
          />
          <span className="tutor-search-counter">{matchInfo.total ? `${matchInfo.current}/${matchInfo.total}` : '0/0'}</span>
          <button className="tutor-search-btn" onClick={jumpToPrev} aria-label="Previous match">Prev</button>
          <button className="tutor-search-btn" onClick={jumpToNext} aria-label="Next match">Next</button>
          <button className="tutor-search-btn" onClick={closeSearchOverlay} aria-label="Close search">Close</button>
        </div>
      )}
      <Worker workerUrl="/pdf.worker.js">
        <div style={{ height: '100%' }}>
          <Viewer
            fileUrl={fileUrl}
            defaultScale={SpecialZoomLevel.ActualSize}
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
                  
                  // Removed: heavy PDF.js text-extraction fallback
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
