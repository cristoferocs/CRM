/** @type {import('eslint').Linter.Config} */
module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint"],
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    env: {
        es2022: true,
        node: true
    },
    parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
    },
    ignorePatterns: ["dist", ".next", "node_modules"]
};