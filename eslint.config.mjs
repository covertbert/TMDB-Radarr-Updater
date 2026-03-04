import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"]
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"]
  })),
  {
    ...unicorn.configs["flat/all"],
    files: ["**/*.ts"]
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: false,
          allowAny: false,
          allowNullish: false
        }
      ],
      "unicorn/prefer-module": "off",
      "unicorn/no-process-exit": "off",
      "unicorn/custom-error-definition": "off",
      "unicorn/import-style": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/explicit-length-check": "off",
      "unicorn/no-array-sort": "off",
      "unicorn/prefer-top-level-await": "off"
    }
  }
);
