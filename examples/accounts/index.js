const express = require("express");
const { postgraphile } = require("postgraphile");
const FederationPlugin = require("@graphile/federation").default;
const PgSimplifyInflectorPlugin = require("@graphile-contrib/pg-simplify-inflector");
const { NodePlugin } = require("graphile-build");

const DATABASE_URL =
  "postgresql://accountsuser:jw8s0F4@localhost:5432/accountsdb";

const app = express();
app.use(
  postgraphile(DATABASE_URL, "public", {
    appendPlugins: [PgSimplifyInflectorPlugin, FederationPlugin],
    graphiql: true,
    watchPg: true,
    skipPlugins: [NodePlugin],
    graphileBuildOptions: {
      pgOmitListSuffix: true,
      pgShortPk: true,
    },
  })
);

app.listen(process.env.PORT || 3002);
