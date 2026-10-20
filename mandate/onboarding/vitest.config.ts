import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["mandate/onboarding/*.test.ts"],testTimeout:60000,hookTimeout:60000,fileParallelism:false}});
