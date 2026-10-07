import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // src/core là logic thuần: không IO, không framework (CLAUDE.md)
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "@/app/*", "@/features/*", "@/components/*"],
              message: "src/core phải thuần, không phụ thuộc tầng khác.",
            },
            {
              group: ["@supabase/*", "next", "next/*", "react"],
              message: "src/core không dùng framework hay Supabase.",
            },
          ],
        },
      ],
    },
  },
  {
    // Component client không được kéo code server (service role, provider)
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/server/*"], message: "Không import src/server từ component/hook phía client." },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "src/types/database.types.ts",
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;
