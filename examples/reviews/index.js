const { ApolloServer, gql } = require("apollo-server");
const { buildFederatedSchema } = require("@apollo/federation");

const typeDefs = gql`
  type Review {
    reviewId: Int!
    body: String!
    author: Account!
    product: Product!
  }

  extend type Account @key(fields: "accountId") {
    accountId: Int! @external
    reviews: [Review!]
  }

  extend type Product @key(fields: "productId") {
    productId: Int! @external
    reviews: [Review!]
  }
`;

const reviews = [
  { productId: 2, accountId: 1, body: "Great Purchase" },
  { productId: 3, accountId: 3, body: "Very Happy" },
  { productId: 3, accountId: 5, body: "Could Be Better" },
  { productId: 4, accountId: 2, body: "Fabulous" },
  { productId: 5, accountId: 3, body: "Awful" },
  { productId: 6, accountId: 3, body: "Perfect" },
];

const resolvers = {
  Query: {},
  Review: {
    __resolveReference(review) {
      return reviews[review.reviewId];
    },
  },
  Account: {
    reviews: account => {
      return reviews.filter(x => x.accountId === account.accountId);
    },
  },
  Product: {
    reviews: product => {
      return reviews.filter(x => x.productId === product.productId);
    },
  },
};

const server = new ApolloServer({
  schema: buildFederatedSchema([{ typeDefs, resolvers }]),
});

server.listen(3004).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
