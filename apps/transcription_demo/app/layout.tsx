import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Document Transcriber Demo',
  description: 'A demo app to upload documents and display transcribed text chunks.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 flex flex-col items-center p-6">
        {children}
      </body>
    </html>
  );
}
