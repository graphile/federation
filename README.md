# @graphile/federation

Apollo federation support for PostGraphile.

Usage:

```
yarn add postgraphile @graphile/federation
npx postgraphile --append-plugins @graphile/federation
```

This plugin exposes the [Global Object Identification
Specification](https://facebook.github.io/relay/graphql/objectidentification.htm)
(i.e. `Node` interface) in a way that's compatible with Apollo Federation.

Requires PostGraphile v4.4.2-rc.0+

## Do you need this?

Only use this if you're planning to have your API consumed by Apollo
Federation; exposing these redundant interfaces to regular users may be
confusing.

## Status

Proof of concept. No tests, use at your own risk! Pull requests very welcome.
