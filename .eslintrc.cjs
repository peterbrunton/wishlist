/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  env: { browser: true, commonjs: true, es6: true },
  ignorePatterns: ["!**/.server", "!**/.client", "extensions/*/dist"],
  extends: ["eslint:recommended"],
  overrides: [
    {
      files: ["**/*.{js,jsx}"],
      plugins: ["react", "jsx-a11y"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
        "prettier",
      ],
      settings: {
        react: { version: "detect" },
        formComponents: ["Form"],
        linkComponents: [
          { name: "Link", linkAttribute: "to" },
          { name: "NavLink", linkAttribute: "to" },
        ],
      },
      rules: {
        "react/prop-types": "off",
        "react/no-unknown-property": ["error", { ignore: ["variant"] }],
      },
    },
    {
      files: [
        ".eslintrc.cjs",
        "vite.config.js",
        ".graphqlrc.js",
        "shopify.server.js",
        "**/*.server.{js,jsx}",
        "app/routes/**/*.{js,jsx}",
      ],
      env: { node: true },
    },
  ],
  globals: { shopify: "readonly" },
};
