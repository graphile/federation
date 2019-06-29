# @graphile/federation

Apollo federation support for PostGraphile

```
yarn add postgraphile @graphile/federation
npx postgraphile --append-plugins @graphile/federation
```

## Do you need this?

Only use this if you're planning to have your API consumed in a federated way;
it reveals things about the schema that you might not wish to expose to end
users.
