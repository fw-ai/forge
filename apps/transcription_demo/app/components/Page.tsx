import React from 'react';
import Fragment from './Fragment';
import { Fragment as FragmentType } from '../types';

interface PageProps {
    pageNumber: number;
    fragments: FragmentType[];
}

const Page: React.FC<PageProps> = ({ pageNumber, fragments }) => {
    return (
        <div className="mb-8">
            <h3 className="text-lg font-medium mb-2 text-gray-700">Page {pageNumber}</h3>
            <div className="border-l-2 border-blue-300 pl-4">
                {fragments.map((fragment, index) => (
                    <Fragment key={index} content={fragment.content} />
                ))}
            </div>
        </div>
    );
};

export default Page;
