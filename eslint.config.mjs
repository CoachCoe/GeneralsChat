import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Recursive patterns. A non-recursive ".next/**" matches only the repo
    // root, so eslint walks any nested build tree and reports hundreds of
    // errors from generated bundles -- a check that always fails is a check
    // nobody runs.
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/next-env.d.ts",
      "**/src/generated/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Allow any types for external API responses and data we don't control
      "@typescript-eslint/no-explicit-any": "off",
      // Allow require() imports for CommonJS compatibility
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
