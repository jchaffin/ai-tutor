"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";


// Use local worker file
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface Annotation {
  id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  type: 'highlight' | 'circle' | 'rectangle'
  color: string
  text?: string
}

interface PDFViewerProps {
  fileUrl: string
  annotations: Annotation[]
  onPageChange?: (page: number) => void
  currentPage?: number
}

const PDFViewer: React.FC<PDFViewerProps> = ({
  fileUrl,
  annotations,
  onPageChange,
  currentPage = 1
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => ({}), []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("PDF load error:", error);
    setError(error.message);
  };



  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!fileUrl) return <p>No PDF to display.</p>;

  return (
    <div className="w-full h-full relative group">
      {/* PDF Content */}
      <div className="w-full h-full overflow-auto bg-gray-50">
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading document…</p>
              </div>
            </div>
          }
          error={
            <div className="flex items-center justify-center h-full">
              <div className="p-4 text-red-600 text-center">
                <p>Failed to load document.</p>
                <p className="text-sm text-gray-500 mt-2">Please try refreshing the page.</p>
              </div>
            </div>
          }
          noData={
            <div className="flex items-center justify-center h-full">
              <div className="p-4 text-gray-600 text-center">No PDF data available.</div>
            </div>
          }
          options={options}
        >
          <div className="space-y-6 p-4">
            {Array.from(new Array(numPages), (el, index) => (
              <div key={`page_${index + 1}`} className="flex flex-col items-center">
                <Page
                  pageNumber={index + 1}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                  className="shadow-md"
                />
              </div>
            ))}
          </div>
        </Document>
      </div>


    </div>
  );
};

export default PDFViewer;
