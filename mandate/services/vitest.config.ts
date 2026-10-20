import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["mandate/services/test/**/*.test.ts","mandate/gateway/test/**/*.test.ts"],testTimeout:30000}});
