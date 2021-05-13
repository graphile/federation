module.exports = {
  testEnvironment: "node",
  snapshotSerializers: ["jest-serializer-graphql-schema"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],
};
