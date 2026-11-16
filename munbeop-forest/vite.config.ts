import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// 결과물은 PRD 8.3에 따라 index.html 하나로 묶는다.
// base "./" — GitHub Pages 하위 경로나 학교 홈페이지 어디에 올려도 동작하게.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
