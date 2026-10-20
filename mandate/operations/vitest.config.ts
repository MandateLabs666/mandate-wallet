import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["mandate/operations/test/**/*.test.ts"],testTimeout:45000,fileParallelism:false}});
