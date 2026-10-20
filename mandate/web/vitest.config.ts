import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["mandate/web/test/**/*.test.ts"],testTimeout:40000,fileParallelism:false}});
