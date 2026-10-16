import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import vitest from "@vitest/eslint-plugin";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import testingLibrary from "eslint-plugin-testing-library";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "**/coverage/", "packages/server/public/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-nested-ternary": "error",
      complexity: ["warn", 10],
      "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='userEvent'][callee.property.name!='setup']",
          message: "Use `const user = userEvent.setup()` and call `user.<action>()`.",
        },
      ],
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/dot-notation": ["error", { allowIndexSignaturePropertyAccess: true }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["packages/server/**/*.ts", "*.js", "packages/*/*.{js,mjs,ts}", "packages/server/scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["packages/server/src/cli.ts", "packages/server/src/demo.ts", "packages/server/scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["packages/web/**/*.{ts,tsx}"],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: { globals: globals.browser },
    settings: { react: { version: "detect" } },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    extends: [vitest.configs.recommended],
    rules: { "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: ["packages/web/**/*.test.{ts,tsx}"],
    extends: [testingLibrary.configs["flat/react"]],
  },
  prettier,
);
