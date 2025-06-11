import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import mongoose from 'mongoose';
import cron from 'node-cron';
import { TenderModel, Tender } from './tender.model';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import sharp from 'sharp';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(bodyParser.json());

mongoose.connect(process.env.DATABASE_URL as string, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
} as any).then(() => {
    console.log('MongoDB connected');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});


// ...existing code...

const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string; // Replace with your key


export async function fetchTenders(): Promise<Tender[]> {
    const baseUrl = 'https://eprocure.gov.in/cppp/latestactivetendersnew/cpppdata/byYzJWc1pXTjBBMTNoMWMyVnNaV04wQTEzaDFjSFZpYkdsemFHVmtYMlJoZEdVPUExM2gx';
    const maxPages = 1500;
    const tenders: Tender[] = [];
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    for (let i = 1001; i <= maxPages; i++) {
        const url = i === 1 ? baseUrl : `${baseUrl}?page=${i}`;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const pageTenders: Tender[] = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('table.list_table tbody tr'));
                return rows.map(row => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length >= 6) {
                        const titleCell = cols[4];
                        const title = (titleCell.innerText || '').trim();

                        // ✅ Directly extract href from anchor tag
                        const anchor = titleCell.querySelector('a');
                        const link = anchor ? anchor.getAttribute('href')?.trim() || '' : '';

                        const tenderIdMatch = title.match(/\[([^\]]+)\]$/);
                        const tenderId = tenderIdMatch ? tenderIdMatch[1] : title;

                        return {
                            tenderId,
                            title,
                            org: (cols[5].innerText || '').trim(),
                            publishedDate: (cols[1].innerText || '').trim(),
                            bidSubmissionClosingDate: (cols[2].innerText || '').trim(),
                            tenderOpeningDate: (cols[3].innerText || '').trim(),
                            titleLinks: link ? [link] : [],
                        };
                    }
                    return null;
                }).filter(Boolean) as Tender[];
            });



            // pageTenders.forEach(tender => console.log('Scraped tender:', tender));
            tenders.push(...pageTenders);
        } catch (err) {
            if (err instanceof Error) {
                console.error(`Failed to scrape page ${i}:`, err.message);
            } else {
                console.error(`Failed to scrape page ${i}:`, err);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // 4 seconds delay
    }

    await browser.close();
    return tenders;
}

// import Tesseract from 'tesseract.js';
// import fs from 'fs';
// async function solveMahaTendersCaptcha() {
//     const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
//     const page = await browser.newPage();

//     // Step 1: Open the page
//     await page.goto('https://mahatenders.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page', {
//         waitUntil: 'networkidle2',
//     });

//     // Step 2: CAPTCHA - Manual Step
//     await page.waitForSelector('#captchaImage');
//     await page.$('#captchaImage').then(el => el?.screenshot({ path: 'captcha.png' }));
//     console.log('Open captcha.png, solve it in browser, then press Enter here.');
//     await new Promise(resolve => { process.stdin.resume(); process.stdin.once('data', () => resolve(null)); });

//     // Step 3: Submit CAPTCHA
//     await page.click('input[type="submit"]');
//     await page.waitForSelector('table.list_table tbody tr');

//     const allTenders: any[] = [];

//     // Step 4: Loop over all pages via "Load Next"
//     while (true) {
//   // Scrape tenders
//   const tenders = await page.evaluate(() => {
//     return Array.from(document.querySelectorAll('table.list_table tbody tr'))
//       .map(row => {
//         const cols = row.querySelectorAll('td');
//         return cols.length >= 5 ? {
//           tenderTitle: cols[4].innerText.trim(),
//           organization: cols[5].innerText.trim(),
//           publishDate: cols[1].innerText.trim(),
//           bidEndDate: cols[2].innerText.trim(),
//           openDate: cols[3].innerText.trim(),
//         } : null;
//       })
//       .filter(Boolean);
//   });

//   console.log(`Scraped ${tenders.length} tenders`);
//   allTenders.push(...tenders);

//   // Check for next page availability
// const isNextVisible = await page.$eval('#loadNext', el => (el as HTMLElement).offsetParent !== null).catch(() => false);

//   if (!isNextVisible) {
//     console.log('✅ No more pages.');
//     break;
//   }

//   const rowCountBefore = await page.$$eval('table.list_table tbody tr', rows => rows.length);

//   // Click next and wait for response + row count change
//   await Promise.all([
//     page.waitForResponse(resp =>
//       resp.url().includes('FrontEndLatestActiveTenders') && resp.status() === 200
//     ),
//     page.click('#loadNext'),
//   ]);

//   await page.waitForFunction(
//     (prevCount) => {
//       const rows = document.querySelectorAll('table.list_table tbody tr');
//       return rows.length !== prevCount;
//     },
//     { timeout: 10000 },
//     rowCountBefore
//   );
// }



//     console.log(`✅ Done. Total tenders scraped: ${allTenders.length}`);
//     console.dir(allTenders, { depth: null });

//     await browser.close();
// }


// async function solveMahaTendersCaptchaAndScrape() {
//     const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
//     const page = await browser.newPage();

//     await page.goto('https://mahatenders.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page', {
//         waitUntil: 'networkidle2',
//     });

//     // Wait for CAPTCHA image and input field
//     await page.waitForSelector('#captchaImage');
//     await page.waitForSelector('#captchaText');

//     // Save the CAPTCHA image for reference
//     const captchaElement = await page.$('#captchaImage');
//     await captchaElement?.screenshot({ path: 'captcha.png' });

//     console.log('📸 CAPTCHA saved as captcha.png');
//     console.log('⏳ Please open the browser window and manually enter the CAPTCHA.');
//     await new Promise(resolve => setTimeout(resolve, 20000)); // wait 20 seconds for manual entry

//     // Click the CAPTCHA submit button
//     await page.click('input[type="submit"]'); // or inspect the actual button selector

//     // await page.waitForTimeout(5000); // wait 5 sec for results to load
//     await new Promise(resolve => setTimeout(resolve, 5000));

//     // Wait for user to solve CAPTCHA manually
//     await new Promise(resolve => {
//         process.stdin.resume();
//         process.stdin.once('data', () => resolve(null));
//     });

//     // Now start scraping
//     const allTenders = [];

//     while (true) {
//         await page.waitForSelector('table.list_table');

//         const tenders = await page.evaluate(() => {
//             const rows = Array.from(document.querySelectorAll('table.list_table tbody tr'));
//             return rows
//                 .map(row => {
//                     const cols = row.querySelectorAll('td');
//                     if (cols.length < 5) return null;

//                     return {
//                         tenderTitle: cols[0].innerText.trim(),
//                         organization: cols[1].innerText.trim(),
//                         publishDate: cols[2].innerText.trim(),
//                         bidEndDate: cols[3].innerText.trim(),
//                         openDate: cols[4].innerText.trim(),
//                     };
//                 })
//                 .filter(Boolean);
//         });

//         console.log(`✅ Scraped ${tenders.length} tenders from page`);
//         allTenders.push(...tenders);

//         // Check for "Next" button
//         const hasNext = await page.evaluate(() => {
//             const nextBtn = document.querySelector('a[title="Go to next page"]');
//             return nextBtn && !nextBtn.classList.contains('disable');
//         });

//         if (!hasNext) break;

//         await Promise.all([
//             page.waitForNavigation({ waitUntil: 'networkidle2' }),
//             page.click('a[title="Go to next page"]'),
//         ]);
//     }

//     console.log('🎯 Finished scraping all tenders');
//     console.log(allTenders);

//     await browser.close();
// }



// async function fetchMahaTenders(): Promise<Tender[]> {
//     const baseUrl = 'https://mahatenders.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page=1';
//     const maxPages = 5;
//     const tenders: Tender[] = [];
//     const browser = await puppeteer.launch({ headless: true });
//     const page = await browser.newPage();
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
//     await page.setRequestInterception(true);
//     page.on('request', (req) => {
//         if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
//             req.abort();
//         } else {
//             req.continue();
//         }
//     });

//     for (let i = 1; i <= maxPages; i++) {
//         const url = i === 1 ? baseUrl : `${baseUrl}?page=${i}`;
//         try {
//             await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

//             const pageTenders: Tender[] = await page.evaluate(() => {
//                 const rows = Array.from(document.querySelectorAll('table.list_table tbody tr'));
//                 return rows.map(row => {
//                     const cols = row.querySelectorAll('td');
//                     if (cols.length >= 6) {
//                         const titleCell = cols[4];
//                         const title = (titleCell.innerText || '').trim();

//                         // ✅ Directly extract href from anchor tag
//                         const anchor = titleCell.querySelector('a');
//                         const link = anchor ? anchor.getAttribute('href')?.trim() || '' : '';

//                         const tenderIdMatch = title.match(/\[([^\]]+)\]$/);
//                         const tenderId = tenderIdMatch ? tenderIdMatch[1] : title;

//                         return {
//                             tenderId,
//                             title,
//                             org: (cols[5].innerText || '').trim(),
//                             publishedDate: (cols[1].innerText || '').trim(),
//                             bidSubmissionClosingDate: (cols[2].innerText || '').trim(),
//                             tenderOpeningDate: (cols[3].innerText || '').trim(),
//                             titleLinks: link ? [link] : [],
//                         };
//                     }
//                     return null;
//                 }).filter(Boolean) as Tender[];
//             });



//             pageTenders.forEach(tender => console.log('Scraped tender:', tender));
//             tenders.push(...pageTenders);
//         } catch (err) {
//             if (err instanceof Error) {
//                 console.error(`Failed to scrape page ${i}:`, err.message);
//             } else {
//                 console.error(`Failed to scrape page ${i}:`, err);
//             }
//         }

//         await new Promise(resolve => setTimeout(resolve, 1000)); // 4 seconds delay
//     }

//     await browser.close();
//     return tenders;
// }
// ...existing code...

// async function fetchMahaTenders(): Promise<Tender[]> {
//     const url = 'https://mahatenders.gov.in/nicgep/app';
//     const tenders: Tender[] = [];
//     const browser = await puppeteer.launch({ headless: true });
//     const page = await browser.newPage();

//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

//     try {
//         await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

//         const pageTenders: Tender[] = await page.evaluate(() => {
//             const tenders: any[] = [];
//             const rows = Array.from(document.querySelectorAll('table tbody tr'));

//             for (const row of rows) {
//                 const cols = row.querySelectorAll('td');
//                 if (cols.length < 6) continue;

//                 const publishedDate = cols[1].innerText.trim();
//                 const bidClosingDate = cols[2].innerText.trim();
//                 const tenderOpeningDate = cols[3].innerText.trim();
//                 const title = cols[4].innerText.trim();
//                 const tenderIdMatch = title.match(/\[([^\]]+)\]$/);
//                 const tenderId = tenderIdMatch ? tenderIdMatch[1] : '';
//                 const org = cols[5].innerText.trim();

//                 tenders.push({
//                     tenderId,
//                     title,
//                     org,
//                     publishedDate,
//                     bidSubmissionClosingDate: bidClosingDate,
//                     tenderOpeningDate,
//                     titleLinks: [],
//                 });
//             }

//             return tenders;
//         });

//         pageTenders.forEach(t => console.log('Scraped:', t));
//         tenders.push(...pageTenders);
//     } catch (err) {
//         console.error('Failed to scrape MahaTenders:', err);
//     } finally {
//         await browser.close();
//     }

//     return tenders;
// }


// async function fetchAllTenders(): Promise<Tender[]> {
//     const [tenders] = await Promise.all([
//         fetchTenders(),
//         // fetchTendersFromMahaTenders()
//     ]);
//     return [...tenders];
// }

export async function saveTendersToMongo(tenders: Tender[]) {
    for (const tender of tenders) {
        try {
            await TenderModel.updateOne(
                { tenderId: tender.tenderId },
                { $set: tender },
                { upsert: true }
            );
        } catch (err) {
            console.error('MongoDB save error:', err, tender);
        }
    }
}

// (async () => {
//     console.log('Running manual tender scrape...');
//     const tenders = await fetchTenders();
//     // solveMahaTendersCaptcha();
//     console.log('Tenders to save:', tenders.length);
//     await saveTendersToMongo(tenders);
//     console.log('Manual tenders scraped and saved.');
// })();

// cron.schedule('0 * * * *', async () => {
//     console.log('Running scheduled tender scrape...');
//     const tenders = await fetchAllTenders();
//     await saveTendersToMongo(tenders);
//     console.log('Tenders updated in MongoDB:', tenders.length);
// });




// ...existing code...

let tenderCache: Tender[] = [];

// Function to refresh cache
async function refreshTenderCache() {
    tenderCache = await TenderModel.find().sort({ publishedDate: -1 }).limit(200).lean();
    console.log('Tender cache refreshed:', tenderCache.length);
}
// // Call once at startup
// refreshTenderCache();
// // Optionally, refresh every 10 minutes
// setInterval(refreshTenderCache, 10 * 60 );



app.post('/api/match-tenders', async (req, res) => {
    const { keywords, location }: { keywords: string[]; location: string } = req.body;
    console.log('Received keywords:', keywords, 'and location:', location);

    try {
        // Build MongoDB query
        const query: any = {};
        if (keywords && keywords.length > 0) {
            const regexArr = keywords.map(kw => new RegExp(kw, 'i'));
            query.$or = [
                { title: { $in: regexArr } },
                { org: { $in: regexArr } }
            ];
        }
        if (location && location.trim() !== "") {
            query.org = { $regex: location, $options: 'i' };
        }

        // If both keywords and location, combine with $and
        let mongoQuery = query;
        if (query.$or && query.org) {
            mongoQuery = { $and: [{ $or: query.$or }, { org: query.org }] };
        }

        const filtered = await TenderModel.find(mongoQuery).lean();
        console.log('Filtered tenders count:', filtered.length);
        res.json(filtered);
    } catch (error) {
        console.error('DB query failed:', error);
        res.status(500).json({ error: 'DB query failed' });
    }
});



app.post('/api/ai-chat', async (req, res) => {
    const { message } = req.body;
    if (!message) res.status(400).json({ reply: "Please enter a message." });

    // 1. Use a simple keyword search (improve with full-text search if needed)
    const keywords = message.split(' ').filter((w: string | any[]) => w.length > 2);
    const regex = new RegExp(keywords.join('|'), 'i');
    const relevantTenders = await TenderModel.find({
        $or: [
            { title: regex },
            { org: regex }
        ]
    }).limit(50).lean();

    if (relevantTenders.length === 0) {
        res.json({ reply: "No relevant tenders found for your query." });
    }

    // 2. Build context from relevant tenders
    const context = relevantTenders.map(t =>
        `Title: ${t.title}
Org: ${t.org}
ID: ${t.tenderId}
Published Date: ${t.publishedDate}
Bid Submission Closing Date: ${t.bidSubmissionClosingDate}
Tender Opening Date: ${t.tenderOpeningDate}
Links: ${t.titleLinks.join(', ')}`
    ).join('\n');

    // 3. Compose the prompt
    const prompt = `
You are a helpful tender assistant. 
Here are some tenders:
${context}

User question: ${message}
Based on the above tenders, answer the user's question. If you can't find a match, say so.
`;

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const reply = result.response.text();
        res.json({ reply });
    } catch (err) {
        console.error('Gemini API error:', err);
        res.status(500).json({ reply: "Sorry, AI service is unavailable." });
    }
});

app.listen(3000, () => console.log('Backend running'));