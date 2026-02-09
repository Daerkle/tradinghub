// Graceful handling if parse module is not available
let Parse;
try {
    Parse = require('parse/node');
} catch (e) {
    console.log('⚠️ Parse module not available, skipping database seeding');
    console.log('   This is normal if running in standalone mode without parse dependency');
    process.exit(0);
}

// Configuration from environment or defaults
const APP_ID = process.env.NEXT_PUBLIC_PARSE_APP_ID || 'tradenote123';
const JS_KEY = process.env.NEXT_PUBLIC_PARSE_JS_KEY || 'tradenote123';
const MASTER_KEY = process.env.MASTER_KEY || 'tradenote123';
const SERVER_URL = process.env.INTERNAL_PARSE_SERVER_URL || process.env.NEXT_PUBLIC_PARSE_SERVER_URL || 'http://localhost:28080/parse';

Parse.initialize(APP_ID, JS_KEY, MASTER_KEY);
Parse.serverURL = SERVER_URL;

async function seedDatabase() {
    console.log('🌱 Starting Database Seeding...');
    console.log('Target Server:', SERVER_URL);

    try {
        // Check connection first
        try {
            await Parse.Config.get();
            console.log('✅ Connection Successful');
        } catch (e) {
            console.error('❌ Connection Failed:', e.message);
            process.exit(1);
        }

        // Define Schemas
        const schemas = [
            {
                className: 'trades',
                fields: {
                    symbol: { type: 'String' },
                    side: { type: 'String' }, // 'long' or 'short'
                    entryPrice: { type: 'Number' },
                    exitPrice: { type: 'Number' },
                    entryTime: { type: 'Date' },
                    exitTime: { type: 'Date' },
                    quantity: { type: 'Number' },
                    pnl: { type: 'Number' },
                    commission: { type: 'Number' },
                    setup: { type: 'String' },
                    notes: { type: 'String' },
                    screenshots: { type: 'Array' },
                    mfe: { type: 'Number' },
                    mae: { type: 'Number' },
                    importSource: { type: 'String' },
                    importHash: { type: 'String' },
                    user: { type: 'Pointer', targetClass: '_User' } // Link to user
                },
                classLevelPermissions: {
                    find: { requiresAuthentication: true },
                    get: { requiresAuthentication: true },
                    create: { requiresAuthentication: true },
                    update: { requiresAuthentication: true },
                    delete: { requiresAuthentication: true },
                }
            },
            {
                className: 'diaries',
                fields: {
                    date: { type: 'Date' },
                    title: { type: 'String' },
                    content: { type: 'String' },
                    mood: { type: 'String' },
                    pnl: { type: 'Number' },
                    tags: { type: 'Array' },
                    images: { type: 'Array' },
                    linkedTrades: { type: 'Array' },
                    user: { type: 'Pointer', targetClass: '_User' }
                },
                classLevelPermissions: {
                    find: { requiresAuthentication: true },
                    get: { requiresAuthentication: true },
                    create: { requiresAuthentication: true },
                    update: { requiresAuthentication: true },
                    delete: { requiresAuthentication: true },
                }
            },
            {
                className: 'playbooks',
                fields: {
                    name: { type: 'String' },
                    description: { type: 'String' },
                    rules: { type: 'Array' },
                    winRate: { type: 'Number' },
                    avgPnl: { type: 'Number' },
                    trades: { type: 'Number' },
                    tags: { type: 'Array' },
                    user: { type: 'Pointer', targetClass: '_User' }
                },
                classLevelPermissions: {
                    find: { requiresAuthentication: true },
                    get: { requiresAuthentication: true },
                    create: { requiresAuthentication: true },
                    update: { requiresAuthentication: true },
                    delete: { requiresAuthentication: true },
                }
            },
            {
                className: 'notes',
                fields: {
                    title: { type: 'String' },
                    content: { type: 'String' },
                    category: { type: 'String' },
                    tags: { type: 'Array' },
                    folderId: { type: 'String' },
                    isPinned: { type: 'Boolean' },
                    isTemplate: { type: 'Boolean' },
                    templateName: { type: 'String' },
                    color: { type: 'String' },
                    user: { type: 'Pointer', targetClass: '_User' }
                },
                classLevelPermissions: {
                    find: { requiresAuthentication: true },
                    get: { requiresAuthentication: true },
                    create: { requiresAuthentication: true },
                    update: { requiresAuthentication: true },
                    delete: { requiresAuthentication: true },
                }
            },
            {
                className: 'screenshots',
                fields: {
                    title: { type: 'String' },
                    description: { type: 'String' },
                    date: { type: 'Date' },
                    symbol: { type: 'String' },
                    setup: { type: 'String' },
                    imageUrl: { type: 'String' },
                    tradeId: { type: 'String' },
                    user: { type: 'Pointer', targetClass: '_User' }
                },
                classLevelPermissions: {
                    find: { requiresAuthentication: true },
                    get: { requiresAuthentication: true },
                    create: { requiresAuthentication: true },
                    update: { requiresAuthentication: true },
                    delete: { requiresAuthentication: true },
                }
            },
            // Missing 'videos' and 'tradingPlans' based on models.ts, adding them for completeness
            {
                className: 'videos',
                fields: {
                    title: { type: 'String' },
                    description: { type: 'String' },
                    date: { type: 'Date' },
                    duration: { type: 'String' },
                    category: { type: 'String' },
                    videoUrl: { type: 'String' },
                    thumbnailUrl: { type: 'String' },
                    user: { type: 'Pointer', targetClass: '_User' }
                },
                classLevelPermissions: {
                    find: { requiresAuthentication: true },
                    get: { requiresAuthentication: true },
                    create: { requiresAuthentication: true },
                    update: { requiresAuthentication: true },
                    delete: { requiresAuthentication: true },
                }
            },
            {
                className: 'tradingPlans',
                fields: {
                    name: { type: 'String' },
                    description: { type: 'String' },
                    isActive: { type: 'Boolean' },
                    // Flattened structure or just generic objects for complex nested data
                    maxDailyLoss: { type: 'Number' },
                    maxDailyTrades: { type: 'Number' },
                    // Array fields
                    entryRules: { type: 'Array' },
                    exitRules: { type: 'Array' },
                    tradingDays: { type: 'Array' },
                    user: { type: 'Pointer', targetClass: '_User' }
                },
                classLevelPermissions: {
                    find: { requiresAuthentication: true },
                    get: { requiresAuthentication: true },
                    create: { requiresAuthentication: true },
                    update: { requiresAuthentication: true },
                    delete: { requiresAuthentication: true },
                }
            }
        ];

        console.log(`\nDefining ${schemas.length} schemas...`);

        for (const schemaDef of schemas) {
            try {
                const schema = new Parse.Schema(schemaDef.className);

                // Add fields
                Object.entries(schemaDef.fields).forEach(([fieldName, config]) => {
                    if (config.type === 'Pointer') {
                        schema.addPointer(fieldName, config.targetClass);
                    } else if (config.type === 'Relation') {
                        schema.addRelation(fieldName, config.targetClass);
                    } else {
                        // Dynamically call addString, addNumber, etc.
                        const method = `add${config.type}`;
                        if (typeof schema[method] === 'function') {
                            schema[method](fieldName);
                        } else {
                            console.warn(`Unknown type ${config.type} for field ${fieldName}`);
                        }
                    }
                });

                // Set Permissions
                if (schemaDef.classLevelPermissions) {
                    schema.setCLP(schemaDef.classLevelPermissions);
                }

                // Save (update if exists, create if not)
                await schema.save(); // save() creates or updates
                console.log(`✅ Schema ensured: ${schemaDef.className}`);

            } catch (e) {
                // If error is "Class already exists", we might want to update it using update()
                // But schema.save() usually handles creation. Update requires get() then update()
                if (e.code === 103) { // Class name taken? usually save works. 
                    console.log(`ℹ️ Schema ${schemaDef.className} existed, attempting update...`);
                    try {
                        // For update we unfortunately need to re-instantiate or just catch. 
                        // Simplification: We assume if it fails it might be because of conflict, but usually save() works for schema.
                        // Let's try explicit update flow if strictly necessary, but standard Parse.Schema save handles upsert often.
                        // Actually, Parse.Schema APIs are: save(), update(), get(), delete(), purge().
                        // If save fails, we try update.
                        const schema = new Parse.Schema(schemaDef.className);
                        Object.entries(schemaDef.fields).forEach(([fieldName, config]) => {
                            if (config.type === 'Pointer') schema.addPointer(fieldName, config.targetClass);
                            else {
                                const method = `add${config.type}`;
                                if (typeof schema[method] === 'function') schema[method](fieldName);
                            }
                        });
                        await schema.update();
                        console.log(`✅ Schema updated: ${schemaDef.className}`);
                    } catch (updateErr) {
                        console.error(`❌ Failed to update schema ${schemaDef.className}:`, updateErr.message);
                    }
                } else {
                    console.error(`❌ Failed to create schema ${schemaDef.className}:`, e.message);
                }
            }
        }

        console.log('\n✨ Database seeding completed!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

seedDatabase();
