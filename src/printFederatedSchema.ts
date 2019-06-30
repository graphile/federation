import { printSchema } from "@apollo/federation";
import {
  transformSchema,
  FilterTypes,
  TransformRootFields,
} from "graphql-tools";
import { GraphQLSchema } from "graphql";

/*
 * These are the fields and types that will be stripped from the printed
 * schema.
 */
const FEDERATION_QUERY_FIELDS = ["_entities", "_service"];
const FEDERATION_TYPE_NAMES = ["_Any", "_FieldSet", "_Service"];

// For memoization:
let lastSchema: any;
let lastPrint: string;

/**
 * When we print the federated schema we need to transform it to remove the
 * Apollo Federation fields (whilst keeping the directives). We need to use the
 * special `printSchema` function from the `@apollo/federation` package because
 * GraphQL's `printSchema` does not include directives.
 *
 * We've added simple memoization for performance reasons; better memoization
 * may be needed if you're dealing with multiple concurrent GraphQL schemas.
 */
export default function printFederatedSchema(schema: GraphQLSchema) {
  // If the schema is new or has changed, recalculate.
  if (schema !== lastSchema) {
    lastSchema = schema;
    /**
     * The Apollo federation spec states:
     *
     * > The federation schema modifications (i.e. new types and directives)
     * > should not be included in this SDL.
     *
     * But we need these fields in the schema for resolution to work, so we're
     * removing them from the schema that gets printed only.
     */
    const schemaSansFederationFields = transformSchema(schema, [
      // Remove the federation fields:
      new TransformRootFields((operation, fieldName, _field) => {
        if (
          operation === "Query" &&
          FEDERATION_QUERY_FIELDS.includes(fieldName)
        ) {
          // Federation query fields: remove (null).
          return null;
        }
        // No change (undefined).
        return undefined;
      }),
      // Remove the federation types:
      new FilterTypes(type => !FEDERATION_TYPE_NAMES.includes(type.name)),
    ]);

    // Print the schema, including the federation directives.
    lastPrint = printSchema(schemaSansFederationFields);
  }
  return lastPrint;
}
