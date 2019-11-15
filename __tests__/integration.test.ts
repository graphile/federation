import federationPlugin from "../src";
import * as http from "http";
import { postgraphile } from "postgraphile";
import { ApolloGateway } from "@apollo/gateway";
import { startFederatedServiceExtendingUser } from "./__fixtures__/federatedServiceExtendingUser";
import { ApolloServer } from "apollo-server";
import * as pg from "pg";
import axios from "axios";

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

test("federated service", async () => {
  const postgraphileServer = await startPostgraphile();
  const serviceExtendingUser = startFederatedServiceExtendingUser();
  let server: ApolloServer | undefined;

  try {
    const serviceList = [
      {
        name: "postgraphile",
        url: toUrl(postgraphileServer.address()!) + "/graphql",
      },
      {
        name: "serviceExtendingUser",
        url: toUrl(
          await serviceExtendingUser.listen({ port: 0, host: "127.0.0.1" })
        ),
      },
    ];

    const { schema, executor } = await new ApolloGateway({
      serviceList,
    }).load();

    expect(schema).toMatchSnapshot("federated schema");

    server = new ApolloServer({
      schema,
      executor,
    });

    const running = await server.listen({ port: 0, host: "127.0.0.1" });

    debugger;
    const result = await axios.post(running.url, {
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
  } finally {
    await postgraphileServer.close();
    await serviceExtendingUser.stop();
    if (server) {
      await server.stop();
    }
  }
});
