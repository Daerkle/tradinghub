import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ||
      'postgresql://tradenote:tradenote_archive@localhost:5433/setup_archive',
  },
  verbose: true,
  strict: true,
});
