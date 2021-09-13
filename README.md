# @graphile/federation

Apollo federation support for PostGraphile (or any Graphile Engine schema).

## Installation

```
yarn add postgraphile @graphile/federation
```

## CLI usage

```
postgraphile --append-plugins @graphile/federation
```

## Library usage

```js
const express = require("express");
const { postgraphile } = require("postgraphile");
const { default: FederationPlugin } = require("@graphile/federation");

const app = express();
app.use(
  postgraphile(process.env.DATABASE_URL, "public", {
    appendPlugins: [FederationPlugin],
  })
);
app.listen(process.env.PORT || 3000);
```

## How?

This plugin exposes the [Global Object Identification
Specification](https://facebook.github.io/relay/graphql/objectidentification.htm)
(i.e. `Node` interface) in a way that's compatible with Apollo Federation.

Requires PostGraphile v4.4.2-rc.0+ and a maintained LTS version of Node.

## Do you need this?

Only use this if you're planning to have your API consumed by Apollo
Federation; exposing these redundant interfaces to regular users may be
confusing.

## Status

Proof of concept. No tests, use at your own risk! Pull requests very welcome.
