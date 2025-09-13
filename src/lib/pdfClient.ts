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
  const threshold = 180; // Lower threshold to detect lighter lines
  const horizontalLines: number[] = [];
  const verticalLines: number[] = [];
  
  console.log(`🎯 detectTableBoundaries called with width=${width}, height=${height}, threshold=${threshold}`);
  
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
    if (maxConsecutive > width * 0.2) horizontalLines.push(y); // Lower threshold for horizontal lines
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
    if (maxConsecutive > height * 0.15) verticalLines.push(x); // Even lower threshold for vertical lines
  }

  console.log(`🎯 Line detection: found ${horizontalLines.length} horizontal lines, ${verticalLines.length} vertical lines`);
  console.log(`🎯 Horizontal lines: [${horizontalLines.slice(0, 10).join(', ')}${horizontalLines.length > 10 ? '...' : ''}]`);
  console.log(`🎯 Vertical lines: [${verticalLines.slice(0, 10).join(', ')}${verticalLines.length > 10 ? '...' : ''}]`);
  
  // If we found at least two vertical and two horizontal guide lines, build rectangles from them
  const rectangles: Array<TableBox & { area: number }> = [];
  if (horizontalLines.length >= 2 && verticalLines.length >= 2) {
    console.log(`🎯 Building rectangles from ${horizontalLines.length} horizontal and ${verticalLines.length} vertical lines`);
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
    console.log(`🎯 No rectangles found, trying density-based detection`);
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

    console.log(`🎯 Found ${colRegions.length} column regions:`, colRegions.map(r => `start:${r.start}, end:${r.end}, density:${r.density}`));
    if (colRegions.length > 0) {
      const left = colRegions[0].start;
      const right = colRegions[colRegions.length - 1].end;
      const area = (bottom - top) * (right - left);
      console.log(`🎯 Checking area: ${area} vs threshold ${width * height * 0.01}, width: ${right - left} vs threshold ${Math.max(15, Math.floor(width * 0.06))}`);
      if (area > width * height * 0.01 && right - left > Math.max(15, Math.floor(width * 0.06))) { // Lower thresholds
        console.log(`🎯 Returning density-based bounds: {left: ${left}, top: ${top}, right: ${right}, bottom: ${bottom}}`);
        return { left, top, right, bottom };
      } else {
        console.log(`🎯 Density-based detection failed area/width checks`);
      }
    }
    // Could not infer a confident rectangle
    return null;
  }

  rectangles.sort((a, b) => b.area - a.area);
  const best = rectangles[0];
  // Extend bottom to include sections below separated by double lines
  const extendedBottom = extendBottomByDensity(best.left, best.right, best.bottom);
  const result = { left: best.left, top: best.top, right: best.right, bottom: extendedBottom };
  
  // Ensure we never return invalid dimensions
  if (result.right <= result.left || extendedBottom <= result.top) {
    console.log('🎯 OCR: Invalid dimensions detected, using fallback bounds');
    return null;
  }
  
  return result;
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
          // Vertically, start ABOVE the anchor to capture tables that might be above the label.
          const padAbove = 60; // Move up to capture table above label
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
          
          const ax = toCanvasX(anchor.left);
          const ay = toCanvasY(anchor.top);
          const ah = toCanvasY(anchor.top + anchor.height) - ay;
          roiX = Math.max(0, ax);
          
          // Calculate ROI width more robustly
          const colEndCanvas = toCanvasX(Math.min(pageRect.width, columnEnd + 12)); // small margin into gutter
          const availableWidth = pdfCanvas.width - roiX;
          const columnWidth = colEndCanvas - roiX;
          
          // Use the more conservative of available width or column width, but ensure minimum viable width
          roiW = Math.max(100, Math.min(availableWidth, columnWidth > 0 ? columnWidth : availableWidth));
          // For top-left tables, search from much higher to capture the full table
          roiY = Math.max(0, ay - toCanvasY(100)); // Start 100px above the anchor to capture full table
          roiH = pdfCanvas.height - roiY; // Scan until the bottom of the page to find all horizontal lines
          console.log(`🎯 ROI Y calculation: ay=${ay}, roiY=${roiY}, roiH=${roiH}`);
          
          // Debug logging for ROI calculation
          console.log(`🎯 ROI calculation: anchor=${JSON.stringify(anchor)}, roiX=${roiX}, roiY=${roiY}, roiW=${roiW}, roiH=${roiH}, availableWidth=${availableWidth}, columnWidth=${columnWidth}`);
        }

        const imageData = ctx.getImageData(roiX, roiY, roiW, roiH);
        const tableBox = detectTableBoundaries(imageData, roiW, roiH);
        console.log(`🎯 Table detection result: ${tableBox ? JSON.stringify(tableBox) : 'null'}`);
        if (tableBox && tableBox.right > tableBox.left && tableBox.bottom > tableBox.top) {
          const scaleX = pageRect.width / pdfCanvas.width;
          const scaleY = pageRect.height / pdfCanvas.height;
          let left = (roiX + tableBox.left) * scaleX;
          let top = (roiY + tableBox.top) * scaleY;
          let right = (roiX + tableBox.right) * scaleX;
          let bottom = (roiY + tableBox.bottom) * scaleY;
          if (anchor) {
            // Lock left edge to current column start; let OCR decide top/bottom.
            left = anchor.left;
            // Let OCR determine the full table boundaries from top to bottom
            // Don't constrain top - let it detect the complete table
            // Cap right to the current column end
            const textEls = Array.from(layerEl.querySelectorAll('span, div')).filter((el) => (el.textContent || '').trim().length > 0);
            const positions = textEls.map((el) => (el.getBoundingClientRect().left - pageRect.left)).sort((a, b) => a - b);
            let columnBoundary = pageRect.width / 2;
            let maxGap = 0;
            for (let i = 1; i < positions.length; i++) { const gap = positions[i] - positions[i - 1]; if (gap > maxGap && gap > 30) { maxGap = gap; columnBoundary = positions[i - 1] + gap / 2; } }
            const isLeftColumn = anchor.left < pageRect.width / 2;
            const columnEnd = maxGap > 30 ? (isLeftColumn ? columnBoundary : pageRect.width) : (isLeftColumn ? pageRect.width / 2 : pageRect.width);
            // Trust OCR result more - only constrain if it's clearly outside reasonable bounds
            const originalRight = right;
            const anchorRight = anchor.left + anchor.width;
            const reasonableMaxRight = Math.min(pageRect.width - 20, Math.max(columnEnd + 5, originalRight * 0.8)); // More generous right boundary
            right = Math.min(reasonableMaxRight, Math.max(right, anchorRight));
            console.log(`🎯 Right calculation: originalRight=${originalRight}, anchorRight=${anchorRight}, columnEnd=${columnEnd}, reasonableMaxRight=${reasonableMaxRight}, finalRight=${right}`);
          }
          // Trim bottom boundary to avoid including text below the table
          const trimmedBottom = Math.min(bottom, top + (bottom - top) * 0.95); // Trim 5% from bottom to capture full table
          
          const finalBounds = {
            left,
            top,
            width: Math.max(0, right - left),
            height: Math.max(0, trimmedBottom - top),
          };
          console.log(`🎯 Final bounds calculation: left=${left}, top=${top}, right=${right}, bottom=${bottom}, width=${finalBounds.width}, height=${finalBounds.height}`);
          return finalBounds;
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
    // Vertically, start ABOVE the anchor to capture tables that might be above the label.
    const padAbove = 60; // Move up to capture table above label
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
    
    const ax = toCanvasX2(anchor.left);
    const ay = toCanvasY2(anchor.top);
    const ah = toCanvasY2(anchor.top + anchor.height) - ay;
    roiX2 = Math.max(0, ax);
    
    // Calculate ROI width more robustly (same fix as main path)
    const colEndCanvas2 = toCanvasX2(Math.min(pageRect.width, columnEnd + 12));
    const availableWidth2 = tempCanvas.width - roiX2;
    const columnWidth2 = colEndCanvas2 - roiX2;
    
    // Use the more conservative of available width or column width, but ensure minimum viable width
    roiW2 = Math.max(100, Math.min(availableWidth2, columnWidth2 > 0 ? columnWidth2 : availableWidth2));
    roiY2 = Math.max(0, ay + ah + padBelow); // Start below the anchor where the table is
    roiH2 = Math.min(tempCanvas.height - roiY2, padBottom);
    
    // Debug logging for fallback ROI calculation
    console.log(`🎯 Fallback ROI calculation: anchor=${JSON.stringify(anchor)}, roiX2=${roiX2}, roiY2=${roiY2}, roiW2=${roiW2}, roiH2=${roiH2}, availableWidth2=${availableWidth2}, columnWidth2=${columnWidth2}`);
  }

  const imageData = tempCtx.getImageData(roiX2, roiY2, roiW2, roiH2);
  const tableBox = detectTableBoundaries(imageData, roiW2, roiH2);
  console.log(`🎯 Fallback table detection result: ${tableBox ? JSON.stringify(tableBox) : 'null'}`);
  if (!tableBox || tableBox.right <= tableBox.left || tableBox.bottom <= tableBox.top) return null;

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


