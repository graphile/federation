const express = require("express");
const { postgraphile } = require("postgraphile");
const FederationPlugin = require("@graphile/federation").default;
const PgSimplifyInflectorPlugin = require("@graphile-contrib/pg-simplify-inflector");
const { makeExtendSchemaPlugin, gql } = require("graphile-utils");
const { NodePlugin } = require("graphile-build");

const ExtensionPlugin = makeExtendSchemaPlugin(build => {
  const { pgSql: sql } = build;
  return {
    typeDefs: gql`
      type Account @key(fields: "accountId") @extends {
        accountId: Int! @external
        purchases: [Purchase!]
      }
    `,
    resolvers: {
      Query: {},
      Account: {
        purchases: async (parent, args, context, resolveInfo) => {
          return resolveInfo.graphile.selectGraphQLResultFromTable(
            sql.fragment`public.purchase`,
            (tableAlias, queryBuilder) => {
              queryBuilder.where(
                sql.fragment`${tableAlias}.account_id=${sql.value(
                  parent.accountId
                )}`
              );
            }
          );
        },
      },
    },
  };
});

const DATABASE_URL =
  "postgresql://productsuser:jw8s0F4@localhost:5432/productsdb";

const app = express();
app.use(
  postgraphile(DATABASE_URL, "public", {
    appendPlugins: [
      ExtensionPlugin,
      PgSimplifyInflectorPlugin,
      FederationPlugin,
    ],
    graphiql: true,
    watchPg: true,
    skipPlugins: [NodePlugin],
    graphileBuildOptions: {
      pgOmitListSuffix: true,
      pgShortPk: true,
    },
  })
);

app.listen(process.env.PORT || 3003);
