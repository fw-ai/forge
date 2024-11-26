import React from 'react';

interface FragmentProps {
    content: string;
}

const Fragment: React.FC<FragmentProps> = ({ content }) => {
    return (
        <div className="mb-4">
            {/* Removed Fragment Number */}
            <div
                className="p-4 bg-gray-50 text-gray-800 rounded shadow-inner"
                dangerouslySetInnerHTML={{ __html: content }}
            />
        </div>
    );
};

export default Fragment;
