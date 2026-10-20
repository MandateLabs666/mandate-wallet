import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["mandate/experiments/test/**/*.test.ts"],testTimeout:30000}});
