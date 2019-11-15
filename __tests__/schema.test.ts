import * as pg from "pg";
import { graphql, ObjectTypeDefinitionNode } from "graphql";
import {
  createPostGraphileSchema,
  PostGraphileCoreOptions,
} from "postgraphile-core";
import { gql } from "graphile-utils";
import federationPlugin from "../src";
import { print } from "graphql";

let pgPool: pg.Pool | null;

beforeAll(() => {
  pgPool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });
});

afterAll(() => {
  if (pgPool) {
    pgPool.end();
    pgPool = null;
  }
});

function buildTestSchema(override?: PostGraphileCoreOptions) {
  return createPostGraphileSchema(pgPool!, ["graphile_federation"], {
    disableDefaultMutations: true,
    appendPlugins: [federationPlugin],
    simpleCollections: "only",
    ...override,
  });
}

test("schema and _service.sdl", async () => {
  const schema = await buildTestSchema();
  expect(schema).toMatchSnapshot("external schema");

  const { data, errors } = await graphql(
    schema,
    `
      query {
        _service {
          sdl
        }
      }
    `,
    null,
    {},
    {}
  );

  expect(errors).toBeUndefined();
  expect(data._service.sdl).toMatchSnapshot("_service.sdl");

  const parsed = gql([data._service.sdl] as any);

  const emailDefinition = parsed.definitions.find(
    def => def.kind === "ObjectTypeDefinition" && def.name.value === "Email"
  ) as ObjectTypeDefinitionNode;

  expect(emailDefinition.directives).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: expect.objectContaining({ value: "key" }),
        arguments: [
          expect.objectContaining({
            name: expect.objectContaining({ value: "fields" }),
            value: expect.objectContaining({ value: "id" }),
          }),
        ],
      }),
    ])
  );

  expect(emailDefinition.directives).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: expect.objectContaining({ value: "key" }),
        arguments: [
          expect.objectContaining({
            name: expect.objectContaining({ value: "fields" }),
            value: expect.objectContaining({ value: "nodeId" }),
          }),
        ],
      }),
    ])
  );

  const userEmailDefinition = parsed.definitions.find(
    def =>
      def.kind === "ObjectTypeDefinition" && def.name.value === "UsersEmail"
  ) as ObjectTypeDefinitionNode;

  expect(userEmailDefinition.directives).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: expect.objectContaining({ value: "key" }),
        arguments: [
          expect.objectContaining({
            name: expect.objectContaining({ value: "fields" }),
            value: expect.objectContaining({ value: "userId emailId" }),
          }),
        ],
      }),
    ])
  );
});

test("querying _entities by primary key and nodeId", async () => {
  const schema = await buildTestSchema();
  const pgClient = await pgPool!.connect();
  try {
    const { data: firstResult, errors: firstErrors } = await graphql(
      schema,
      `
        query {
          _entities(representations: [{ __typename: "User", id: 1 }]) {
            ... on User {
              __typename
              nodeId
              id
              firstName
            }
          }
        }
      `,
      null,
      { pgClient },
      {}
    );
    expect(firstErrors).toBeUndefined();
    expect(firstResult._entities).toEqual([
      {
        __typename: "User",
        id: 1,
        firstName: "alicia",
        nodeId: expect.any(String),
      },
    ]);

    const { data: secondResult, errors: secondErrors } = await graphql(
      schema,
      `
        query {
          _entities(representations: [{ __typename: "User", nodeId: "${firstResult._entities[0].nodeId}" }]) {
            ... on User {
              __typename
              nodeId
              id
              firstName
            }
          }
        }
      `,
      null,
      { pgClient },
      {}
    );

    expect(secondErrors).toBeUndefined();
    expect(secondResult._entities).toEqual(firstResult._entities);
  } finally {
    pgClient.release();
  }
});

test("querying _entities for multiple results of different type by id", async () => {
  const schema = await buildTestSchema();
  const pgClient = await pgPool!.connect();
  try {
    const { data: firstResult, errors: firstErrors } = await graphql(
      schema,
      `
        query {
          _entities(
            representations: [
              { __typename: "User", id: 1 }
              { __typename: "Email", id: 1 }
            ]
          ) {
            ... on Node {
              __typename
              nodeId
            }
            ... on User {
              id
              firstName
            }
            ... on Email {
              id
              email
            }
          }
        }
      `,
      null,
      { pgClient },
      {}
    );
    expect(firstErrors).toBeUndefined();
    expect(firstResult._entities).toEqual([
      {
        __typename: "User",
        id: 1,
        firstName: "alicia",
        nodeId: expect.any(String),
      },
      {
        __typename: "Email",
        id: 1,
        email: "piano@example.com",
        nodeId: expect.any(String),
      },
    ]);
  } finally {
    pgClient.release();
  }
});

test("querying _entities for object with combined primary key", async () => {
  const schema = await buildTestSchema();
  const pgClient = await pgPool!.connect();
  try {
    const { data: firstResult, errors: firstErrors } = await graphql(
      schema,
      `
        query {
          _entities(
            representations: [
              { __typename: "UsersEmail", userId: 1, emailId: 2 }
            ]
          ) {
            ... on Node {
              __typename
              nodeId
            }
            ... on UsersEmail {
              userId
              emailId
            }
          }
        }
      `,
      null,
      { pgClient },
      {}
    );
    expect(firstErrors).toBeUndefined();
    expect(firstResult._entities).toEqual([
      {
        __typename: "UsersEmail",
        userId: 1,
        emailId: 2,
        nodeId: expect.any(String),
      },
    ]);
  } finally {
    pgClient.release();
  }
});
