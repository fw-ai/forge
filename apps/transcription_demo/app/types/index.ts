export interface Fragment {
    content: string;
}

export interface Page {
    fragments: Fragment[];
}

export interface TranscribedData {
    pages: Page[];
}
