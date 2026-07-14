import globals from "globals";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

const ignoredPaths = [
  ".next/**",
  "node_modules/**",
  "reports/**",
  "work/**",
  "scripts/archive/**",
  "public/**",
  "app/lib/meaning-mode/*.generated.mjs",
  "app/lib/meaning-mode/generated/**"
];

export default [
  { ignores: ignoredPaths },
  {
    files: ["app/**/*.{js,jsx,mjs}", "scripts/**/*.{js,mjs}", "*.mjs"],
    plugins: {
      "@next/next": nextPlugin,
      react: reactPlugin,
      "react-hooks": reactHooks
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-undef": "error",
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error"
    }
  },
  {
    files: ["app/**/*.{js,jsx,mjs}"],
    ignores: ["app/**/__tests__/**"],
    rules: {
      "no-unused-vars": ["warn", {
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "none",
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_"
      }],
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    files: ["app/**/*.cjs", "scripts/**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node
    },
    rules: {
      "no-undef": "error"
    }
  }
];
