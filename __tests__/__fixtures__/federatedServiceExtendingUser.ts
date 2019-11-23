import { gql } from "graphile-utils";

import { ApolloServer } from "apollo-server";
import { buildFederatedSchema } from "@apollo/federation";

const typeDefs = gql`
  type Query {
    empty: ID
  }

  extend type User @key(fields: "nodeId") {
    nodeId: ID! @external
    firstName: String! @external
    lastName: String! @external
    fullName: String! @requires(fields: "firstName lastName")
  }
`;

const resolvers = {
  User: {
    fullName({ firstName, lastName }: { firstName: string; lastName: string }) {
      return `${firstName} ${lastName}`;
    },
  },
};

export function startFederatedServiceExtendingUser() {
  return new ApolloServer({
    schema: buildFederatedSchema([
      {
        typeDefs,
        resolvers,
      },
    ]),
  });
}
