import { defineConfig } from "vitest/config";
export default defineConfig({
	test: { include: ["echo/gateway/test/**/*.test.ts"], testTimeout: 30000 },
});
