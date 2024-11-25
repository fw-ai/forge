'use client';

import { useState, ChangeEvent, FormEvent } from 'react';

interface FileUploadProps {
    onUpload: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload }) => {
    const [file, setFile] = useState<File | null>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (file) {
            onUpload(file);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col items-center space-y-4"
        >
            <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.mp3,.wav"
                onChange={handleFileChange}
                className="
          block w-full text-sm text-gray-700
          file:mr-4 file:py-2 file:px-4
          file:rounded-full file:border-0
          file:text-sm file:font-semibold
          file:bg-blue-50 file:text-blue-700
          hover:file:bg-blue-100
        "
            />
            <button
                type="submit"
                className="
          px-4 py-2
          bg-blue-600
          text-white
          rounded
          hover:bg-blue-700
        "
            >
                Upload and Transcribe
            </button>
        </form>
    );
};

export default FileUpload;
