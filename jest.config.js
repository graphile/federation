module.exports = {
  snapshotSerializers: ["jest-serializer-graphql-schema"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],
};
