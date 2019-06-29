module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "prettier/@typescript-eslint",
    "plugin:prettier/recommended",
  ],
  plugins: [
    "jest",
    "@typescript-eslint",
    "prettier",
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    node: true,
    jest: true,
    es6: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        args: "after-used",
        ignoreRestSiblings: true,
      },
    ],

    "no-unused-expressions": [
      "error",
      {
        allowTernary: true,
      },
    ],
    "no-confusing-arrow": 0,
    "no-else-return": 0,
    "no-return-assign": [2, "except-parens"],
    "no-underscore-dangle": 0,
    "arrow-body-style": 0,
    "no-nested-ternary": 0,
    camelcase: 0,
    "prefer-arrow-callback": [
      "error",
      {
        allowNamedFunctions: true,
      },
    ],
    "class-methods-use-this": 0,
    "no-restricted-syntax": 0,
    "no-param-reassign": [
      "error",
      {
        props: false,
      },
    ],

    "jest/no-focused-tests": 2,
    "jest/no-identical-title": 2,

    "import/no-extraneous-dependencies": 0,
  },
};
