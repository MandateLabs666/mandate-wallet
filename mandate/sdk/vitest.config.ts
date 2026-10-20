import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["mandate/sdk/test/**/*.test.ts"],testTimeout:30000}});
