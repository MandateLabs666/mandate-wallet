import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["mandate/desktop/desktop.test.ts"],testTimeout:40000,fileParallelism:false}});
