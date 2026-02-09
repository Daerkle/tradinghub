const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({
    queue: { concurrency: 1 } // Simple config
});

async function testYahooData() {
    const symbol = 'AAPL';
    console.log(`Testing data fetch for ${symbol}...`);

    try {
        // 1. Test Quote for Sector/Industry
        console.log('\n--- Quote Data ---');
        try {
            const quote = await yahooFinance.quote(symbol);
            // console.log(JSON.stringify(quote, null, 2));
            console.log('Sector (regular):', quote.sector);
            console.log('Industry (regular):', quote.industry);
            // Check if it's in a summary property
            console.log('displayName:', quote.displayName);
            console.log('longName:', quote.longName);
        } catch (e) {
            console.error('Quote fetch failed:', e.message);
        }

        // 2. Test Quote Summary (assetProfile) - this is where sector/industry usually live
        console.log('\n--- Quote Summary (assetProfile) ---');
        try {
            const summary = await yahooFinance.quoteSummary(symbol, { modules: ['assetProfile'] });
            const profile = summary.assetProfile;
            if (profile) {
                console.log('Summary Sector:', profile.sector);
                console.log('Summary Industry:', profile.industry);
            } else {
                console.log('No assetProfile found');
            }
        } catch (e) {
            console.log('Error fetching quoteSummary:', e.message);
        }

        // 3. Test News
        console.log('\n--- News Data ---');
        try {
            const search = await yahooFinance.search(symbol, { newsCount: 5 });
            console.log(`Found ${search.news ? search.news.length : 0} news items`);
            if (search.news && search.news.length > 0) {
                console.log('First Item:', JSON.stringify(search.news[0], null, 2));
            }
        } catch (e) {
            console.log('Error fetching news:', e.message);
        }

    } catch (error) {
        console.error('Fatal Error:', error);
    }
}

testYahooData();
