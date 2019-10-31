const { ApolloGateway, RemoteGraphQLDataSource } = require("@apollo/gateway");
const { ApolloServer } = require("apollo-server");
var waitOn = require("wait-on");

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  constructor(config) {
    super(config);
  }

  willSendRequest({ request, context }) {
    request.http.headers.set("x-account-id", context.account);
    request.http.headers.set("x-organization-id", context.organization);
  }
}

async function main() {
  await waitOn({
    resources: [
      "http://localhost:3002/graphiql",
      "http://localhost:3003/graphiql",
      "http://localhost:3004/.well-known/apollo/server-health",
    ],
  });

  const gateway = new ApolloGateway({
    serviceList: [
      { name: "accounts", url: "http://localhost:3002/graphql" },
      { name: "products", url: "http://localhost:3003/graphql" },
      { name: "reviews", url: "http://localhost:3004/" },
    ],
    buildService({ url }) {
      return new AuthenticatedDataSource({ url });
    },
  });

  const server = new ApolloServer({
    gateway,
    subscriptions: false,
    context: ({ req }) => {
      return {
        account: req.headers["x-account-id"],
        organization: req.headers["x-organization-id"],
      };
    },
  });

  server.listen(3001).then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
  });
}

main();
