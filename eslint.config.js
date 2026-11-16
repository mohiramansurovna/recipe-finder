import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".venv/**", "node_modules/**", "coverage/**", "dist/**", ".gradle/**", "android/**/build/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
