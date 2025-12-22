import { defineConfig } from "cypress";
import { resetDatabase } from "./cypress/support/db-reset";
import dotenv from 'dotenv';

// Load environment variables from .env.local (or path from CYPRESS_ENV_PATH)
dotenv.config({ path: process.env.CYPRESS_ENV_PATH || '.env.local' });

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1920,
    viewportHeight: 1080,
    setupNodeEvents(on, config) {
      on('task', {
        async resetDb() {
          // Prefer values from config.env (set by Cypress) falling back to process.env
          const supabaseUrl = config.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
          const serviceKey = config.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
          const testUserId = config.env.TEST_USER_ID || process.env.CYPRESS_TEST_USER_ID;

          if (!supabaseUrl || !serviceKey || !testUserId) {
            throw new Error(
              'Missing env for resetDb. Ensure SUPABASE_URL, SUPABASE_SERVICE_KEY and TEST_USER_ID are set (in process.env, cypress.env.json, or .env.local)'
            );
          }

          const result = await resetDatabase(supabaseUrl as string, serviceKey as string, testUserId as string);
          return result;
        }
      });

      return config;
    },
    env: {
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      TEST_USER_ID: process.env.CYPRESS_TEST_USER_ID
    }
  },
});
