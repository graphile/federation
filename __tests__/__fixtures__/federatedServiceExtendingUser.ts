import { gql } from "graphile-utils";

import { ApolloServer } from "apollo-server";
import { buildSubgraphSchema } from "@apollo/federation";

const typeDefs = gql`
  type Query {
    empty: ID
    group(letter: String!): Group
    federatedEmail(id: Int!): Email
  }

  extend type Email @key(fields: "id") {
    id: Int! @external
  }

  extend type User @key(fields: "nodeId") {
    nodeId: ID! @external
    id: Int! @external
    firstName: String! @external
    lastName: String! @external
    fullName: String! @requires(fields: "firstName lastName")
    group: Group
  }

  type Group @key(fields: "name") {
    name: String!
    users: [User]
  }
`;

const resolvers = {
  Query: {
    federatedEmail(_: any, { id }: any) {
      return {
        __typename: 'Email',
        id
      }
    },
    group(_: any, { letter }: any) {
      return {
        __typename: 'Group',
        name: `Group ${letter.charAt(0).toUpperCase()}`
      }
    }
  },
  User: {
    fullName({ firstName, lastName }: { firstName: string; lastName: string }) {
      return `${firstName} ${lastName}`;
    },
    group({ lastName }: { lastName: String}) {
      return {
        __typename: 'Group',
        name: `Group ${lastName.charAt(0).toUpperCase()}`
      }
    }
  },
  Group: {
    name({ name }: { name: string }) {
      return name
    },
    users({ name }: { name: string }) {
      switch(name.charAt(name.length - 1)) {
        case 'K': return [{ __typeName: 'User', nodeId: 'WyJ1c2VycyIsMV0=' }]
        case 'M': return [{ __typeName: 'User', nodeId: 'WyJ1c2VycyIsMl0=' }]
        case 'B': return [{ __typeName: 'User', nodeId: 'WyJ1c2VycyIsM10=' }]
        default: return []
      }
    }
  }
};

export function startFederatedServiceExtendingUser() {
  return new ApolloServer({
    schema: buildSubgraphSchema([
      {
        typeDefs,
        resolvers,
      },
    ]),
  });
}
