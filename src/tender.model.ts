import mongoose from 'mongoose';

export interface Tender {
    tenderId: string;
    title: string; // Title + Ref.No./Tender ID (combined)
    org: string;
    publishedDate: string;
    bidSubmissionClosingDate: string;
    tenderOpeningDate: string;
    titleLinks: string[]; // Array of links in the title cell
}

const tenderSchema = new mongoose.Schema<Tender>({
    tenderId: { type: String, unique: true },
    title: String,
    org: String,
    publishedDate: String,
    bidSubmissionClosingDate: String,
    tenderOpeningDate: String,
    titleLinks: [String],
});

export const TenderModel = mongoose.model<Tender>('Tender', tenderSchema);