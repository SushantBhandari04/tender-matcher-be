import mongoose from 'mongoose';
import { fetchTenders, saveTendersToMongo } from './server'; // Adjust path if needed
import dotenv from 'dotenv';

// Load environment variables (if using .env)
dotenv.config();

async function main() {
    // Use env variable or fallback to hardcoded URI (not recommended for production)
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sushbh2004:sushant1234@cluster0.byi6a.mongodb.net/tenders';

    try {
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        } as any);
        console.log('MongoDB connected');

        const tenders = await fetchTenders();
        console.log('Tenders scraped:', tenders.length);

        await saveTendersToMongo(tenders);
        console.log('Tenders saved to MongoDB');
    } catch (err) {
        console.error('Error in scraping:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

main();