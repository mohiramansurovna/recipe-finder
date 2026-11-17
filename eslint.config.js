import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".venv/**", "node_modules/**", "coverage/**", "dist/**", "android/**/build/**", "android/.gradle/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
