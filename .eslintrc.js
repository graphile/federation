{
  "env": {
    "browser": false,
    "es6": true,
    "node": true
  },

  "parser": "@typescript-eslint/parser",

  "parserOptions": {
    "project": "tsconfig.json",
    "sourceType": "module"
  },

  "plugins": ["@typescript-eslint", "jest", "jsdoc"],

  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:jest/recommended",
    "prettier"
  ],

  "settings": {
    "import/parsers": {
      "@typescript-eslint/parser": [".ts"]
    }
  },

  "rules": {
    "no-confusing-arrow": 0,
    "no-else-return": 0,
    "no-return-assign": [2, "except-parens"],
    "no-underscore-dangle": 0,
    "arrow-body-style": 0,
    "no-nested-ternary": 0,
    "camelcase": 0,
    "class-methods-use-this": 0,
    "no-restricted-syntax": 0,
    "jest/no-focused-tests": 2,
    "jest/no-identical-title": 2,
    "import/no-extraneous-dependencies": 0,

    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "args": "after-used",
        "ignoreRestSiblings": true
      }
    ],

    "no-unused-expressions": [
      "error",
      {
        "allowTernary": true
      }
    ],

    "prefer-arrow-callback": [
      "error",
      {
        "allowNamedFunctions": true
      }
    ],

    "no-param-reassign": [
      "error",
      {
        "props": false
      }
    ],

    "jsdoc/require-jsdoc": [
      1,
      {
        "publicOnly": true,
        "require": {
          "ClassDeclaration": true,
          "ArrowFunctionExpression": true,
          "MethodDefinition": true
        }
      }
    ],

    "max-len": [
      "warn",
      {
        "code": 115
      }
    ]
  }
}
