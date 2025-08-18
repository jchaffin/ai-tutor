"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/Button";
import { 
  Download, 
  Printer,
  X,
  Edit
} from "lucide-react";

// Use local worker file
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

type Props = {
  pdfUrl?: string;
  height?: number;
  filename?: string;
  onClose?: () => void;
  onEdit?: () => void;
  showEditButton?: boolean;
};

const PDFViewer: React.FC<Props> = ({
  pdfUrl,
  height = 720,
  filename = "resume-preview.pdf",
  onClose,
  onEdit,
  showEditButton = false,
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

  const handleDownload = () => {
    if (!pdfUrl) return;
    
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank');
  };

  const actionButtons = useMemo(
    () => (
      <div className="flex flex-col gap-2">
        {showEditButton && onEdit && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onEdit}
            className="w-10 h-10 p-0 bg-blue-600/80 hover:bg-blue-700 text-white border-0"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </Button>
        )}
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handlePrint}
          className="w-10 h-10 p-0 bg-black/60 hover:bg-black/80 text-white border-0"
          title="Print"
        >
          <Printer className="w-4 h-4" />
        </Button>
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleDownload}
          className="w-10 h-10 p-0 bg-black/60 hover:bg-black/80 text-white border-0"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </Button>
        
        {onClose && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="w-10 h-10 p-0 bg-black/60 hover:bg-black/80 text-white border-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    ),
    [onClose, onEdit, showEditButton, handleDownload, handlePrint],
  );

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!pdfUrl) return <p>No PDF to display.</p>;

  return (
    <div className="w-full h-full relative group">
      {/* PDF Content */}
      <div className="w-full h-full overflow-auto bg-gray-50">
        <Document
          file={pdfUrl}
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

      {/* Action Buttons - appears on right side on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute top-4 right-4 z-10 pointer-events-auto">
          {actionButtons}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
