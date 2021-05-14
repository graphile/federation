import * as pg from "pg";
import { graphql, ObjectTypeDefinitionNode } from "graphql";
import {
  createPostGraphileSchema,
  PostGraphileCoreOptions,
} from "postgraphile-core";
import { gql } from "graphile-utils";
import federationPlugin from "../src";
import { GraphQLSchema } from "graphql";

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

async function queryWithTestSchema(
  schema: GraphQLSchema | Promise<GraphQLSchema>,
  query: string
) {
  const pgClient = await pgPool!.connect();
  try {
    return graphql(await schema, query, null, { pgClient }, {});
  } finally {
    pgClient.release();
  }
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
  expect(data!._service.sdl).toMatchSnapshot("_service.sdl");

  const parsed = gql([data!._service.sdl] as any);

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
            value: expect.objectContaining({ value: "nodeId" }),
          }),
        ],
      }),
    ])
  );
});

test("querying _entities by nodeId", async () => {
  const { data, errors } = await queryWithTestSchema(
    buildTestSchema(),
    `
        query {
          _entities(
            representations: [
              { __typename: "User", nodeId: "WyJ1c2VycyIsMV0=" }
            ]
          ) {
            ... on User {
              __typename
              nodeId
              id
              firstName
            }
          }
        }
      `
  );
  expect(errors).toBeUndefined();
  expect(data && data._entities).toEqual([
    {
      __typename: "User",
      id: 1,
      firstName: "alicia",
      nodeId: expect.any(String),
    },
  ]);
});
