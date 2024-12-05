import React from 'react';
import Fragment from './Fragment';
import { Fragment as FragmentType } from '../types';

interface PageProps {
    pageNumber: number;
    fragments: FragmentType[];
}

const Page: React.FC<PageProps> = ({ fragments }) => {
    return (
        <div className="mb-8">
            <div>
                {fragments.map((fragment, index) => (
                    <Fragment key={index} content={fragment.content} />
                ))}
            </div>
        </div>
    );
};

export default Page;
