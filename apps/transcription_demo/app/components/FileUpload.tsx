'use client';

import { useState, ChangeEvent, FormEvent, DragEvent, useRef } from 'react';
import { AiOutlineCloudUpload, AiOutlineClose } from 'react-icons/ai';

interface FileUploadProps {
    onUpload: (file: File) => Promise<void>;
    isLoading: boolean; // Receive loading state from parent
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload, isLoading }) => {
    const [file, setFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null); // Ref for the file input

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    // Updated event types to HTMLFormElement
    const handleDragOver = (e: DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const handleDrop = (e: DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            validateAndSetFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    };

    const validateAndSetFile = (selectedFile: File) => {
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'audio/wav',
        ];
        const maxSizeInBytes = 10 * 1024 * 1024; // 10MB

        if (!allowedTypes.includes(selectedFile.type)) {
            setError('Unsupported file type. Please select a valid file.');
            setFile(null);
            return;
        }

        if (selectedFile.size > maxSizeInBytes) {
            setError('File size exceeds the 10MB limit.');
            setFile(null);
            return;
        }

        setError(null);
        setFile(selectedFile);
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (file) {
            try {
                await onUpload(file);
                // Reset the form after successful upload
                setFile(null);
                if (inputRef.current) {
                    inputRef.current.value = ''; // Reset the file input's value
                }
            } catch (uploadError) {
                setError('An error occurred during the upload. Please try again.');
                console.error(uploadError);
            }
        } else {
            setError('Please select a file to upload.');
        }
    };

    const handleClearFile = () => {
        setFile(null);
        setError(null);
        if (inputRef.current) {
            inputRef.current.value = ''; // Reset the file input's value
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="w-full max-w-md mx-auto"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div
                className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-md transition-colors ${dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white'
                    }`}
            >
                <p className="text-gray-600 text-sm">Drag & Drop your file here</p>
                <p className="text-gray-500 text-xs mb-2">or</p>
                <label
                    htmlFor="file-upload"
                    className="cursor-pointer px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition-colors flex items-center space-x-2"
                >
                    <span>Browse Files</span>
                </label>
                <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.wav"
                    onChange={handleFileChange}
                    ref={inputRef} // Attach the ref
                    className="hidden"
                />
            </div>

            {file && (
                <div className="mt-4 flex items-center justify-between bg-gray-100 p-3 rounded-md">
                    <div>
                        <p className="text-gray-700 font-medium">{file.name}</p>
                        <p className="text-gray-500 text-sm">
                            {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleClearFile}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        aria-label="Remove file"
                    >
                        <AiOutlineClose size={20} />
                    </button>
                </div>
            )}

            {error && (
                <p className="mt-2 text-red-600 text-sm text-center">{error}</p>
            )}

            <button
                type="submit"
                disabled={!file || isLoading}
                className={`mt-6 w-full px-4 py-2 rounded-md text-white font-semibold transition-colors ${!file || isLoading
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                    } flex items-center justify-center`}
            >
                {isLoading ? (
                    <>
                        {/* Optionally, keep the spinner inside the button */}
                        <svg
                            className="animate-spin h-5 w-5 mr-3 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                            ></circle>
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v8H4z"
                            ></path>
                        </svg>
                        Uploading...
                    </>
                ) : (
                    <>
                        <AiOutlineCloudUpload className="mr-2" />
                        Transcribe and Chunk
                    </>
                )}
            </button>
        </form>
    );
};

export default FileUpload;
