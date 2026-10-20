import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["mandate/evidence/test/**/*.test.ts"],testTimeout:30000}});
