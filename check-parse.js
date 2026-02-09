const Parse = require('parse/node');

// Configuration from docker-compose.yml
const APP_ID = 'tradenote123';
const JS_KEY = 'tradenote123';
const MASTER_KEY = 'tradenote123'; // Using Master Key to bypass CLP/ACL for check
const SERVER_URL = 'http://localhost:28080/parse';

Parse.initialize(APP_ID, JS_KEY, MASTER_KEY);
Parse.serverURL = SERVER_URL;

async function checkServer() {
    console.log('Connecting to Parse Server at', SERVER_URL);

    try {
        // 1. Check Health (simple query)
        try {
            const config = await Parse.Config.get();
            console.log('✅ Connection Successful! Config retrieved.');
        } catch (e) {
            console.error('❌ Connection Failed:', e.message);
            return;
        }

        // 2. List Schemas
        console.log('\nChecking Schemas...');
        try {
            // Parse.Schema.all() requires master key
            const schemas = await Parse.Schema.all();

            if (schemas.length === 0) {
                console.log('⚠️ No schemas found. Database might be empty.');
            } else {
                console.log(`✅ Found ${schemas.length} schemas:`);
                schemas.forEach(s => console.log(` - ${s.className}`));
            }

            // 3. Check specific classes
            const requiredClasses = ['trades', 'diaries', 'playbooks', 'notes'];
            const missing = requiredClasses.filter(c => !schemas.some(s => s.className === c));

            if (missing.length > 0) {
                console.log('\n⚠️ Missing expected classes:', missing.join(', '));
            } else {
                console.log('\n✅ All core classes appear to exist.');
            }

        } catch (e) {
            console.error('❌ Failed to list schemas:', e.message);
        }

    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
}

checkServer();
