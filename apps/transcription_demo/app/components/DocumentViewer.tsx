'use client';

import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface DocumentViewerProps {
    file: File;
    pageNumber: number;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ file, pageNumber }) => {
    const [fileData, setFileData] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [, setNumPages] = useState<number | null>(null);
    const [isPdf, setIsPdf] = useState<boolean>(false);

    useEffect(() => {
        // Convert File to base64 string
        const getBase64 = (file: File): Promise<string> => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (error) => reject(error);
            });
        };

        setIsPdf(file.type === 'application/pdf');

        getBase64(file)
            .then((data) => setFileData(data))
            .catch((err) => setError(err));
    }, [file]);

    if (error) {
        return (
            <div className="text-red-500">
                Error loading document: {error.message}
            </div>
        );
    }

    if (!fileData) {
        return <div>Loading...</div>;
    }

    if (!isPdf) {
        return (
            <div className="document-viewer w-full overflow-hidden">
                <img
                    src={fileData}
                    alt="Document preview"
                    className="mx-auto max-w-full h-auto"
                />
            </div>
        );
    }

    return (
        <div className="document-viewer w-full overflow-hidden">
            <Document
                file={fileData}
                onLoadError={(err) => setError(err)}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            >
                <Page
                    pageNumber={pageNumber}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="mx-auto max-w-full h-auto"
                    scale={1}
                />
            </Document>
        </div>
    );
};

export default DocumentViewer;
