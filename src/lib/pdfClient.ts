// Client-side PDF utilities for DOM/OCR-based analysis (no Node deps)
import html2canvas from 'html2canvas';

export interface RectBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TableBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Detect table-like rectangular boundaries by scanning pixel data for long dark lines
export function detectTableBoundaries(imageData: ImageData, width: number, height: number): TableBox | null {
  const data = imageData.data;
  const threshold = 200;
  const horizontalLines: number[] = [];
  const verticalLines: number[] = [];
  
  // Helper: extend bottom boundary downward if dense content continues (treats double lines as separators)
  const extendBottomByDensity = (left: number, right: number, startBottom: number): number => {
    const regionLeft = Math.max(0, Math.min(left, width - 1));
    const regionRight = Math.max(regionLeft + 1, Math.min(right, width - 1));
    const regionWidth = Math.max(1, regionRight - regionLeft + 1);
    // Baseline density from the area just above the current bottom
    let baseSum = 0;
    let baseRows = 0;
    for (let y = Math.max(0, startBottom - 12); y <= startBottom && y < height; y++) {
      let cnt = 0;
      for (let x = regionLeft; x <= regionRight; x++) {
        const i = (y * width + x) * 4;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness < threshold) cnt++;
      }
      baseSum += cnt / regionWidth;
      baseRows++;
    }
    const baseDensity = baseRows > 0 ? baseSum / baseRows : 0.25;
    // Dynamic thresholds: keep extending while row density is reasonably close to table's baseline
    const onThreshold = Math.max(0.08, baseDensity * 0.35);
    const offThresholdConsecutive = 22; // require sustained whitespace to stop

    let extendedBottom = startBottom;
    let lowRun = 0;
    for (let y = startBottom + 1; y < height; y++) {
      let cnt = 0;
      for (let x = regionLeft; x <= regionRight; x++) {
        const i = (y * width + x) * 4;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness < threshold) cnt++;
      }
      const ratio = cnt / regionWidth;
      if (ratio >= onThreshold) {
        // Treat dense rows (including double borders) as inside-table; continue extending
        extendedBottom = y;
        lowRun = 0;
      } else {
        lowRun++;
        if (lowRun >= offThresholdConsecutive) break;
      }
    }
    return extendedBottom;
  };

  // Horizontal lines
  for (let y = 0; y < height; y++) {
    let consecutiveDark = 0;
    let maxConsecutive = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness < threshold) {
        consecutiveDark++;
        if (consecutiveDark > maxConsecutive) maxConsecutive = consecutiveDark;
      } else {
        consecutiveDark = 0;
      }
    }
    if (maxConsecutive > width * 0.3) horizontalLines.push(y);
  }

  // Vertical lines
  for (let x = 0; x < width; x++) {
    let consecutiveDark = 0;
    let maxConsecutive = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness < threshold) {
        consecutiveDark++;
        if (consecutiveDark > maxConsecutive) maxConsecutive = consecutiveDark;
      } else {
        consecutiveDark = 0;
      }
    }
    if (maxConsecutive > height * 0.3) verticalLines.push(x);
  }

  // If we found at least two vertical and two horizontal guide lines, build rectangles from them
  const rectangles: Array<TableBox & { area: number }> = [];
  if (horizontalLines.length >= 2 && verticalLines.length >= 2) {
    for (let i = 0; i < horizontalLines.length - 1; i++) {
      for (let j = i + 1; j < horizontalLines.length; j++) {
        for (let k = 0; k < verticalLines.length - 1; k++) {
          for (let l = k + 1; l < verticalLines.length; l++) {
            const area = (horizontalLines[j] - horizontalLines[i]) * (verticalLines[l] - verticalLines[k]);
            if (area > width * height * 0.02) {
              rectangles.push({ left: verticalLines[k], top: horizontalLines[i], right: verticalLines[l], bottom: horizontalLines[j], area });
            }
          }
        }
      }
    }
  }

  // Fallback when vertical lines are missing: infer columns by vertical dark pixel density
  if (rectangles.length === 0) {
    // Compute vertical density of dark pixels
    const colDensity = new Array<number>(width).fill(0);
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness < threshold) count++;
      }
      colDensity[x] = count;
    }
    // Smooth a bit
    const smooth = (arr: number[], w: number) => {
      const out = new Array(arr.length).fill(0);
      const half = Math.max(1, Math.floor(w / 2));
      for (let i = 0; i < arr.length; i++) {
        let sum = 0, n = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) { sum += arr[j]; n++; }
        out[i] = sum / n;
      }
      return out;
    };
    const smoothCols = smooth(colDensity, 9);
    const colThreshold = height * 0.08; // Lower threshold to catch more content
    const colRegions: Array<{ start: number; end: number; density: number }> = [];
    let runStart: number | null = null;
    for (let x = 0; x < width; x++) {
      const isDarkCol = smoothCols[x] >= colThreshold;
      if (isDarkCol && runStart === null) runStart = x;
      if ((!isDarkCol || x === width - 1) && runStart !== null) {
        const end = isDarkCol ? x : x - 1;
        const len = end - runStart + 1;
        if (len > Math.max(8, Math.floor(width * 0.02))) { // Lower minimum width
          const avgDensity = smoothCols.slice(runStart, end + 1).reduce((a, b) => a + b, 0) / len;
          colRegions.push({ start: runStart, end, density: avgDensity });
        }
        runStart = null;
      }
    }

    // Compute horizontal density to infer top/bottom if needed
    const rowDensity = new Array<number>(height).fill(0);
    for (let y = 0; y < height; y++) {
      let count = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness < threshold) count++;
      }
      rowDensity[y] = count;
    }
    const smoothRows = smooth(rowDensity, 9);
    const rowThreshold = width * 0.08; // Lower threshold
    let top = 0, bottom = height - 1;
    if (horizontalLines.length >= 2) {
      top = Math.min(...horizontalLines);
      bottom = Math.max(...horizontalLines);
    } else {
      // Find top and bottom by density
      let foundTop = false;
      for (let y = 0; y < height; y++) { if (smoothRows[y] >= rowThreshold) { top = y; foundTop = true; break; } }
      for (let y = height - 1; y >= 0; y--) { if (smoothRows[y] >= rowThreshold) { bottom = y; break; } }
      if (!foundTop) return null;
    }

    if (colRegions.length > 0) {
      const left = colRegions[0].start;
      const right = colRegions[colRegions.length - 1].end;
      const area = (bottom - top) * (right - left);
      if (area > width * height * 0.01 && right - left > Math.max(15, Math.floor(width * 0.06))) { // Lower thresholds
        return { left, top, right, bottom };
      }
    }
    // Could not infer a confident rectangle
    return null;
  }

  rectangles.sort((a, b) => b.area - a.area);
  const best = rectangles[0];
  // Extend bottom to include sections below separated by double lines
  const extendedBottom = extendBottomByDensity(best.left, best.right, best.bottom);
  return { left: best.left, top: best.top, right: best.right, bottom: extendedBottom };
}

// Render a page layer to canvas and detect table bounds using OCR-ish pixel analysis
export async function ocrDetectTableBoundsFromLayer(
  layerEl: HTMLElement,
  anchor?: { left: number; top: number; width: number; height: number }
): Promise<RectBounds | null> {
  // 1) Prefer the actual PDF canvas pixels (most reliable for line detection)
  const pdfCanvas = layerEl.querySelector('canvas') as HTMLCanvasElement | null;
  if (pdfCanvas) {
    try {
      const ctx = pdfCanvas.getContext('2d');
      if (ctx) {
        const pageRect = layerEl.getBoundingClientRect();
        const toCanvasX = (x: number) => Math.max(0, Math.min(pdfCanvas.width, Math.round((x / pageRect.width) * pdfCanvas.width)));
        const toCanvasY = (y: number) => Math.max(0, Math.min(pdfCanvas.height, Math.round((y / pageRect.height) * pdfCanvas.height)));

        // Define region of interest (below/around the label) if anchor provided
        let roiX = 0, roiY = 0, roiW = pdfCanvas.width, roiH = pdfCanvas.height;
        if (anchor) {
          // Preserve current left edge; only expand to the right within the SAME column.
          // Vertically, start just BELOW the anchor to avoid circling the caption.
          const padBelow = 8;
          const padBottom = Math.max(360, Math.round(pageRect.height * 0.65));

          // Detect column boundary from DOM text positions (layer coordinates)
          const textEls = Array.from(layerEl.querySelectorAll('span, div')).filter((el) => (el.textContent || '').trim().length > 0);
          const positions = textEls.map((el) => (el.getBoundingClientRect().left - pageRect.left)).sort((a, b) => a - b);
          let columnBoundary = pageRect.width / 2;
          let maxGap = 0;
          for (let i = 1; i < positions.length; i++) {
            const gap = positions[i] - positions[i - 1];
            if (gap > maxGap && gap > 30) { maxGap = gap; columnBoundary = positions[i - 1] + gap / 2; }
          }
          // Strict column enforcement: if no clear gap, use page halves
          const isLeftColumn = anchor.left < pageRect.width / 2;
          const columnEnd = maxGap > 30 ? (isLeftColumn ? columnBoundary : pageRect.width) : (isLeftColumn ? pageRect.width / 2 : pageRect.width);
          
          // For right column tables, be more conservative with the ROI width
          if (!isLeftColumn && maxGap <= 30) {
            const conservativeWidth = Math.min(columnEnd - roiX, pageRect.width * 0.4);
            roiW = Math.max(20, conservativeWidth);
          }

          const ax = toCanvasX(anchor.left);
          const ay = toCanvasY(anchor.top);
          const ah = toCanvasY(anchor.top + anchor.height) - ay;
          roiX = Math.max(0, ax);
          const colEndCanvas = toCanvasX(Math.min(pageRect.width, columnEnd + 12)); // small margin into gutter
          roiW = Math.max(20, Math.min(pdfCanvas.width - roiX, colEndCanvas - roiX));
          roiY = Math.max(0, ay + ah + padBelow);
          roiH = Math.min(pdfCanvas.height - roiY, padBottom);
        }

        const imageData = ctx.getImageData(roiX, roiY, roiW, roiH);
        const tableBox = detectTableBoundaries(imageData, roiW, roiH);
        if (tableBox) {
          const scaleX = pageRect.width / pdfCanvas.width;
          const scaleY = pageRect.height / pdfCanvas.height;
          let left = (roiX + tableBox.left) * scaleX;
          let top = (roiY + tableBox.top) * scaleY;
          let right = (roiX + tableBox.right) * scaleX;
          let bottom = (roiY + tableBox.bottom) * scaleY;
          if (anchor) {
            // Lock left edge to current column start; let OCR decide top/bottom.
            const minTop = anchor.top + anchor.height + 6;
            left = anchor.left;
            top = Math.max(top, minTop);
            // Cap right to the current column end
            const textEls = Array.from(layerEl.querySelectorAll('span, div')).filter((el) => (el.textContent || '').trim().length > 0);
            const positions = textEls.map((el) => (el.getBoundingClientRect().left - pageRect.left)).sort((a, b) => a - b);
            let columnBoundary = pageRect.width / 2;
            let maxGap = 0;
            for (let i = 1; i < positions.length; i++) { const gap = positions[i] - positions[i - 1]; if (gap > maxGap && gap > 30) { maxGap = gap; columnBoundary = positions[i - 1] + gap / 2; } }
            const isLeftColumn = anchor.left < pageRect.width / 2;
            const columnEnd = maxGap > 30 ? (isLeftColumn ? columnBoundary : pageRect.width) : (isLeftColumn ? pageRect.width / 2 : pageRect.width);
            // Allow OCR to determine the full table width within the column, with minimal constraint
            right = Math.min(columnEnd - 2, Math.max(right, anchor.left + anchor.width));
          }
          return {
            left,
            top,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
          };
        }
      }
    } catch {}
  }

  // 2) Fallback: snapshot the layer with html2canvas (may miss vector lines in some PDFs)
  const canvasElement = await html2canvas(layerEl, {
    scale: 3,
    useCORS: true,
    allowTaint: true,
  });

  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return null;
  tempCanvas.width = canvasElement.width;
  tempCanvas.height = canvasElement.height;
  tempCtx.drawImage(canvasElement, 0, 0);

  // Compute ROI from anchor in layer coordinates
  const pageRect = layerEl.getBoundingClientRect();
  const toCanvasX2 = (x: number) => Math.max(0, Math.min(tempCanvas.width, Math.round((x / pageRect.width) * tempCanvas.width)));
  const toCanvasY2 = (y: number) => Math.max(0, Math.min(tempCanvas.height, Math.round((y / pageRect.height) * tempCanvas.height)));
  let roiX2 = 0, roiY2 = 0, roiW2 = tempCanvas.width, roiH2 = tempCanvas.height;
  if (anchor) {
    // Preserve current left edge; only expand to the right within the SAME column.
    // Vertically, start just BELOW the anchor to avoid circling the caption.
    const padBelow = 8;
    const padBottom = Math.max(360, Math.round(pageRect.height * 0.65));

    // Detect column boundary using DOM positions (layer coordinates)
    const textEls = Array.from(layerEl.querySelectorAll('span, div')).filter((el) => (el.textContent || '').trim().length > 0);
    const positions = textEls.map((el) => (el.getBoundingClientRect().left - pageRect.left)).sort((a, b) => a - b);
    let columnBoundary = pageRect.width / 2;
    let maxGap = 0;
    for (let i = 1; i < positions.length; i++) {
      const gap = positions[i] - positions[i - 1];
      if (gap > maxGap && gap > 30) { maxGap = gap; columnBoundary = positions[i - 1] + gap / 2; }
    }
    const isLeftColumn = anchor.left < pageRect.width / 2;
    const columnEnd = maxGap > 30 ? (isLeftColumn ? columnBoundary : pageRect.width) : (isLeftColumn ? pageRect.width / 2 : pageRect.width);
    
    // For right column tables, be more conservative with the ROI width
    if (!isLeftColumn && maxGap <= 30) {
      const conservativeWidth = Math.min(columnEnd - roiX2, pageRect.width * 0.4);
      roiW2 = Math.max(20, conservativeWidth);
    }

    const ax = toCanvasX2(anchor.left);
    const ay = toCanvasY2(anchor.top);
    const ah = toCanvasY2(anchor.top + anchor.height) - ay;
    roiX2 = Math.max(0, ax);
    const colEndCanvas2 = toCanvasX2(Math.min(pageRect.width, columnEnd + 12));
    roiW2 = Math.max(20, Math.min(tempCanvas.width - roiX2, colEndCanvas2 - roiX2));
    roiY2 = Math.max(0, ay + ah + padBelow);
    roiH2 = Math.min(tempCanvas.height - roiY2, padBottom);
  }

  const imageData = tempCtx.getImageData(roiX2, roiY2, roiW2, roiH2);
  const tableBox = detectTableBoundaries(imageData, roiW2, roiH2);
  if (!tableBox) return null;

  const scaleX = pageRect.width / tempCanvas.width;
  const scaleY = pageRect.height / tempCanvas.height;
  let left = (roiX2 + tableBox.left) * scaleX;
  let top = (roiY2 + tableBox.top) * scaleY;
  let right = (roiX2 + tableBox.right) * scaleX;
  let bottom = (roiY2 + tableBox.bottom) * scaleY;
  if (anchor) {
    const minTop = anchor.top + anchor.height + 6;
    left = anchor.left; // keep left fixed
    top = Math.max(top, minTop); // ensure we don't select caption area
    // Cap right to the current column end
    const textEls = Array.from(layerEl.querySelectorAll('span, div')).filter((el) => (el.textContent || '').trim().length > 0);
    const positions = textEls.map((el) => (el.getBoundingClientRect().left - pageRect.left)).sort((a, b) => a - b);
    let columnBoundary = pageRect.width / 2;
    let maxGap = 0;
    for (let i = 1; i < positions.length; i++) { const gap = positions[i] - positions[i - 1]; if (gap > maxGap && gap > 30) { maxGap = gap; columnBoundary = positions[i - 1] + gap / 2; } }
    const isLeftColumn = anchor.left < pageRect.width / 2;
    const columnEnd = maxGap > 30 ? (isLeftColumn ? columnBoundary : pageRect.width) : (isLeftColumn ? pageRect.width / 2 : pageRect.width);
    right = Math.min(columnEnd - 6, Math.max(right, anchor.left + anchor.width));
  }
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

// Analyze nearby content around a label to infer a tight bounding region (2-column aware)
export function analyzeContentBoundsAroundLabel(
  layerEl: HTMLElement,
  labelRect: DOMRect,
  kind: 'table' | 'figure' | 'generic'
): RectBounds | null {
  const layerRect = layerEl.getBoundingClientRect();
  const pageWidth = layerRect.width;

  const textElements = Array.from(layerEl.querySelectorAll('span, div')).filter((el) => {
    const text = el.textContent?.trim();
    return text && text.length > 0;
  });
  if (textElements.length === 0) return null;

  // Column detection by largest horizontal gap
  const textPositions = textElements
    .map((el) => (el.getBoundingClientRect().left - layerRect.left))
    .sort((a, b) => a - b);
  let columnBoundary = pageWidth / 2;
  let maxGap = 0;
  for (let i = 1; i < textPositions.length; i++) {
    const gap = textPositions[i] - textPositions[i - 1];
    if (gap > maxGap && gap > 30) {
      maxGap = gap;
      columnBoundary = textPositions[i - 1] + gap / 2;
    }
  }

  const labelLeft = labelRect.left - layerRect.left;
  const labelTop = labelRect.top - layerRect.top;
  const labelWidth = labelRect.width;
  const labelHeight = labelRect.height;
  const isLeftColumn = labelLeft < columnBoundary;
  const columnStart = isLeftColumn ? 0 : columnBoundary;
  const columnEnd = isLeftColumn ? columnBoundary : pageWidth;

  const contentElements = textElements.filter((el) => {
    const rect = el.getBoundingClientRect();
    const elTop = rect.top - layerRect.top;
    const elLeft = rect.left - layerRect.left;
    const elRight = elLeft + rect.width;
    const elementInColumn = isLeftColumn ? (elLeft >= columnStart && elLeft < columnEnd) : (elLeft >= columnStart && elLeft < layerRect.width);
    if (!elementInColumn) return false;

    if (kind === 'table') {
      const isBelow = elTop >= labelTop - 20;
      const horizontalOverlap = !(elRight < labelLeft - 100 || elLeft > labelLeft + labelWidth + 100);
      const isVeryClose = (elTop - labelTop) < 200;
      const hasTableLikeContent = el.textContent && (/\d/.test(el.textContent) || (el.textContent.length < 50) || /[|─┌┐└┘├┤┬┴┼]/.test(el.textContent));
      return isBelow && horizontalOverlap && isVeryClose && hasTableLikeContent;
    } else if (kind === 'figure') {
      const verticalDistance = Math.abs(elTop - labelTop);
      const horizontalDistance = Math.abs(elLeft - labelLeft);
      return verticalDistance < 300 && horizontalDistance < (pageWidth / 2) * 0.8;
    } else {
      const verticalDistance = Math.abs(elTop - labelTop);
      const horizontalDistance = Math.abs(elLeft - labelLeft);
      return verticalDistance < 200 && horizontalDistance < (pageWidth / 2) * 0.7;
    }
  });

  if (contentElements.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, maxX = 0, maxY = 0;
  contentElements.forEach((el) => {
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

  // For tables, try to tightly bound data rows
  if (kind === 'table') {
    const columnMargin = 30;
    const tableElements = contentElements.filter((el) => {
      const text = el.textContent?.trim() || '';
      const rect = el.getBoundingClientRect();
      const elTop = rect.top - layerRect.top;
      const elLeft = rect.left - layerRect.left;
      if (elTop <= labelTop) return false;
      const inSameColumn = Math.abs(elLeft - labelLeft) < columnMargin || (elLeft >= columnStart && elLeft <= columnEnd);
      if (!inSameColumn) return false;
      return (text.length > 0 && text.length <= 48 && (/[\d%]/.test(text) || text.split(/\s+/).filter(Boolean).length <= 6) && !(/[.!?]{2,}/.test(text)));
    });

    if (tableElements.length > 0) {
      const sorted = tableElements
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { top: rect.top - layerRect.top, bottom: rect.bottom - layerRect.top, text: el.textContent?.trim() || '' };
        })
        .sort((a, b) => a.top - b.top);
      let tableStartY = sorted[0].top;
      let tableEndY = sorted[sorted.length - 1].bottom;
      let firstDataY: number | null = null;
      let lastDataY: number | null = null;
      for (const elem of sorted) {
        const isDataRow = /\d/.test(elem.text);
        if (isDataRow) {
          if (firstDataY === null) firstDataY = elem.top;
          lastDataY = elem.bottom;
        }
      }
      if (firstDataY !== null && lastDataY !== null) {
        tableStartY = firstDataY;
        tableEndY = lastDataY;
      }
      const padding = 20;
      const finalTop = Math.max(labelTop, tableStartY - padding);
      const finalBottom = tableEndY + padding;
      minY = Math.min(minY, finalTop);
      maxY = Math.max(maxY, finalBottom);
    } else {
      const conservativeBottom = labelTop + 300;
      maxY = Math.max(maxY, conservativeBottom);
    }
  }

  // Include the original label
  minX = Math.min(minX, labelLeft);
  minY = Math.min(minY, labelTop);
  maxX = Math.max(maxX, labelLeft + labelWidth);
  maxY = Math.max(maxY, labelTop + labelHeight);
  // Constrain to column boundaries
  minX = Math.max(columnStart + 10, minX);
  maxX = Math.min(columnEnd - 10, maxX);

  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}


