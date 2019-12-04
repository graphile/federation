import federationPlugin from "../src";
import * as http from "http";
import { postgraphile } from "postgraphile";
import { ApolloGateway } from "@apollo/gateway";
import { startFederatedServiceExtendingUser } from "./__fixtures__/federatedServiceExtendingUser";
import { ApolloServer, ServerInfo } from "apollo-server";
import * as pg from "pg";
import axios from "axios";
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

function startPostgraphile(): Promise<http.Server> {
  return new Promise(resolve => {
    if (!pgPool) {
      throw new Error("pool not ready!");
    }
    const httpServer = http.createServer(
      postgraphile(pgPool, "graphile_federation", {
        disableDefaultMutations: true,
        appendPlugins: [federationPlugin],
        simpleCollections: "only",
        retryOnInitFail: true,
      })
    );

    httpServer.once("listening", () => resolve(httpServer));
    httpServer.listen({ port: 0, host: "127.0.0.1" });
  });
}

function toUrl(
  obj: string | { address: string; port: number | string; family: string }
) {
  return typeof obj === "string"
    ? obj
    : obj.family === "IPv6"
    ? `http://[${obj.address}]:${obj.port}`
    : `http://${obj.address}:${obj.port}`;
}

async function withFederatedExternalServices(
  startExternalServices: {
    [serviceName: string]: () => ApolloServer | Promise<ApolloServer>;
  },
  cb: (_: { serverInfo: ServerInfo; schema: GraphQLSchema }) => Promise<any>
) {
  const postgraphileServer = await startPostgraphile();
  const externalServices = await Promise.all(
    Object.entries(startExternalServices).map(
      async ([name, serviceBuilder]) => {
        const service = await serviceBuilder();
        return {
          name,
          service,
          url: toUrl(await service.listen({ port: 0, host: "127.0.0.1" })),
        };
      }
    )
  );
  let server: ApolloServer | undefined;

  try {
    const serviceList = [
      {
        name: "postgraphile",
        url: toUrl(postgraphileServer.address()!) + "/graphql",
      },
      ...externalServices,
    ];

    const { schema, executor } = await new ApolloGateway({
      serviceList,
    }).load();

    server = new ApolloServer({
      schema,
      executor,
    });

    const serverInfo = await server.listen({ port: 0, host: "127.0.0.1" });

    await cb({ serverInfo, schema });
  } finally {
    await postgraphileServer.close();
    for (const external of externalServices) {
      await external.service.stop();
    }
    if (server) {
      await server.stop();
    }
  }
}

test("federated service", async () => {
  await withFederatedExternalServices(
    {
      serviceExteningUser: startFederatedServiceExtendingUser,
    },
    async ({ serverInfo, schema }) => {
      expect(schema).toMatchSnapshot("federated schema");

      const result = await axios.post(serverInfo.url, {
        query: `{ allUsersList(first: 1) { firstName, lastName, fullName} }`,
      });

      expect(result.data).toMatchObject({
        data: {
          allUsersList: [
            {
              firstName: "alicia",
              fullName: "alicia keys",
              lastName: "keys",
            },
          ],
        },
      });
    }
  );
});
