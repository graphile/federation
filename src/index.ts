import {
  makeExtendSchemaPlugin,
  makePluginByCombiningPlugins,
  gql,
  ExtensionDefinition,
} from "graphile-utils";

import type {
  GraphQLFieldConfigMap,
  GraphQLObjectTypeConfig,
  GraphQLResolveInfo,
} from "graphql";

import { Build, Context, Plugin } from "graphile-build";
import printFederatedSchema from "./printFederatedSchema";
import { ObjectTypeDefinition, Directive, StringValue } from "./AST";
import { PgAttribute } from "graphile-build-pg";
import { PromiseOrValue } from "graphql/jsutils/PromiseOrValue";

import { defaultResolveReference } from "./defaultResolveReference";

export type GraphQLReferenceResolver<TContext> = (
  reference: Record<string, unknown>,
  context: TContext,
  info: GraphQLResolveInfo,
) => unknown;

declare module "graphql/type/definition" {
  interface GraphQLObjectType {
    resolveReference?: GraphQLReferenceResolver<unknown>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface GraphQLObjectTypeConfig<TSource, TContext> {
    resolveReference?: GraphQLReferenceResolver<TContext>;
  }
}

/**
 * This plugin installs the schema outlined in the Apollo Federation spec, and
 * the resolvers and types required. Comments have been added to make things
 * clearer for consumers, and the Apollo fields have been deprecated so that
 * users unconcerned with federation don't get confused.
 *
 * https://www.apollographql.com/docs/apollo-server/federation/federation-spec/#federation-schema-specification
 */
const SchemaExtensionPlugin = makeExtendSchemaPlugin(
  (build: Build): ExtensionDefinition => {
    const {
      graphql: { GraphQLScalarType, getNullableType, isObjectType },
      resolveNode,
      $$isQuery,
      getTypeByName,
      inflection,
      nodeIdFieldName,
    } = build;

    // Cache
    let Query: unknown;

    /**
     * Checks if the value is an async function.
     * @param value The value.
     * @returns A value indicating if the value is an async function.
     */
    function isPromise<T>(value: PromiseOrValue<T>): value is Promise<T> {
      return Boolean(
        value && "then" in value && typeof value.then === "function",
      );
    }

    /**
     * Add type name to return object.
     * @param maybeObject The return object.
     * @param typename The name of the type representation.
     * @returns The resolved type representation.
     */
    function addTypeNameToPossibleReturn<T>(
      maybeObject: null | T,
      typename: string,
    ): null | (T & { __typename: string }) {
      if (maybeObject !== null && typeof maybeObject === "object") {
        Object.defineProperty(maybeObject, "__typename", {
          value: typename,
        });
      }
      return maybeObject as null | (T & { __typename: string });
    }

    return {
      typeDefs: gql`
        """
        Used to represent a federated entity via its keys.
        """
        scalar _Any

        """
        Used to represent a set of fields. Grammatically, a field set is a
        selection set minus the braces.
        """
        scalar _FieldSet

        """
        A union of all federated types (those that use the @key directive).
        """
        union _Entity

        """
        Describes our federated service.
        """
        type _Service {
          """
          The GraphQL Schema Language definition of our endpoint including the
          Apollo Federation directives (but not their definitions or the special
          Apollo Federation fields).
          """
          sdl: String
            @deprecated(reason: "Only Apollo Federation should use this")
        }

        extend type Query {
          """
          Fetches a list of entities using their representations; used for Apollo
          Federation.
          """
          _entities(representations: [_Any!]!): [_Entity]!
            @deprecated(reason: "Only Apollo Federation should use this")
          """
          Entrypoint for Apollo Federation to determine more information about
          this service.
          """
          _service: _Service!
            @deprecated(reason: "Only Apollo Federation should use this")
        }

        directive @extends on OBJECT | INTERFACE
        directive @external on FIELD_DEFINITION
        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
        directive @key(fields: _FieldSet!) on OBJECT | INTERFACE
      `,
      resolvers: {
        Query: {
          _entities(data, { representations }, context, resolveInfo) {
            const {
              graphile: { fieldContext },
            } = resolveInfo;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return representations.map(async (representation: any) => {
              if (!representation || isObjectType(representation)) {
                throw new Error("Invalid representation");
              }

              const { __typename, [nodeIdFieldName]: nodeId } = representation;

              if (!__typename) {
                throw new Error(
                  "Failed to interpret representation, no typename",
                );
              }

              if (nodeId) {
                // Support node interface.
                if (typeof nodeId !== "string") {
                  throw new Error(
                    "Failed to interpret representation, invalid nodeId",
                  );
                }

                return resolveNode(
                  nodeId,
                  build,
                  fieldContext,
                  data,
                  context,
                  resolveInfo,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ).then((x: any) =>
                  addTypeNameToPossibleReturn(x, __typename),
                );
              } else {
                // Support non node interface keys.
                // Validate user-defined type against schema
                // to make sure it exists.
                const type = resolveInfo.schema.getType(__typename);

                if (!type || !isObjectType(type)) {
                  throw new Error(
                    // eslint-disable-next-line max-len
                    `The _entities resolver tried to load an entity for type "${__typename}", but no object type of that name was found in the schema`,
                  );
                }

                const result = build.resolveReferences[type.name]
                  ? build.resolveReferences[type.name](
                      representation,
                      context,
                      resolveInfo,
                    )
                  : build.defaultResolveReference(
                      build,
                      representation,
                      context,
                      resolveInfo,
                    );

                if (isPromise(result)) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  return result.then((x: any) =>
                    addTypeNameToPossibleReturn(x, __typename),
                  );
                }

                return addTypeNameToPossibleReturn(result, __typename);
              }
            });
          },

          _service(_, _args, _context, { schema }) {
            return schema;
          },
        },

        _Service: {
          sdl(schema) {
            return printFederatedSchema(schema);
          },
        },

        _Entity: {
          __resolveType(value) {
            // This uses the same resolution as the Node interface,
            // which can be found in graphile-build's NodePlugin
            if (value === $$isQuery) {
              if (!Query) Query = getTypeByName(inflection.builtin("Query"));
              return Query;
            } else if (value["__typename"]) {
              return getNullableType(value["__typename"]);
            }
          },
        },

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        _Any: new GraphQLScalarType({
          name: "_Any",
          serialize(value: unknown) {
            return value;
          },
        }),
      },
    };
  },
);

/*
 * This plugin adds the `@key(fields: "nodeId")` directive to the types that
 * implement the Node interface, and adds these types to the _Entity union
 * defined above.
 */
const AddKeyPlugin: Plugin = (builder) => {
  // Extend the Graphile build object.
  // The build object will be available throughout the
  // current schema build and is passed to all hooks.
  builder.hook("build", (build) => {
    // The names of entities to use for federation.
    build.EntityNamesToFederate = [];

    // The GraphQLObjectTypes to add to the _Entity union type for federation.
    build.graphqlObjectTypesForEntityType = [];

    // Add the default federation representation resolver.
    build.defaultResolveReference = defaultResolveReference;

    build.resolveReferences = {}

    return build;
  });

  builder.hook(
    "GraphQLObjectType",
    (
      type: GraphQLObjectTypeConfig<unknown, unknown>,
      build: Build,
      context: Context<GraphQLObjectTypeConfig<unknown, unknown>>,
    ) => {
      const { DirectiveNode, ObjectTypeDefinitionNode } = build;
      const {
        scope: { pgIntrospection, isPgRowType },
      } = context;

      const { inflection } = build;

      if (
        !(
          isPgRowType &&
          pgIntrospection.isSelectable &&
          pgIntrospection.namespace &&
          pgIntrospection.primaryKeyConstraint
        )
      ) {
        return type;
      }

      const primaryKeyNames =
        pgIntrospection.primaryKeyConstraint.keyAttributes.map(
          (attr: PgAttribute) => inflection.column(attr),
        );

      if (!primaryKeyNames.length) {
        return type;
      }

      const astNode = {
        ...ObjectTypeDefinition(type),
        ...type.astNode,
      };

      (astNode.directives as typeof DirectiveNode[]).push(
        Directive("key", { fields: StringValue(primaryKeyNames.join(" ")) }),
      );

      type.astNode = astNode as typeof ObjectTypeDefinitionNode;

      if (!build.EntityNamesToFederate.includes(type.name)) {
        // Add type name to list so we can use it later to get
        // it's GraphQLObjectType and add it to the _Entity union type.
        build.EntityNamesToFederate.push(type.name);
      }

      return type;
    },
  );

  builder.hook(
    "GraphQLObjectType:fields",
    (
      fields: GraphQLFieldConfigMap<unknown, unknown>,
      build: Build,
      context: Context<GraphQLFieldConfigMap<unknown, unknown>>,
    ) => {
      const {
        Self,
        scope: { isRootQuery },
      } = context;

      // Drop the `query` field. If we don't remove it,
      // it will clash with other federated services `query` fields.
      if (isRootQuery) {
        const { query, ...rest } = fields;
        return rest;
      }

      // Skip if not an entity we want to federate.
      if (!build.EntityNamesToFederate.includes(Self.name)) {
        return fields;
      }

      if (
        !(build.graphqlObjectTypesForEntityType as []).some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: any) => e.name === Self.name,
        )
      ) {
        // Add this to the list of types to be in the _Entity union.
        build.graphqlObjectTypesForEntityType.push(Self);
      }

      return fields;
    },
  );

  // Find out what types implement the Node interface
  builder.hook("GraphQLObjectType:interfaces", (interfaces, build, context) => {
    const { getTypeByName, inflection, nodeIdFieldName } = build;
    const {
      GraphQLObjectType: spec,
      Self,
      scope: { isRootQuery },
    } = context;
    const NodeInterface = getTypeByName(inflection.builtin("Node"));

    /*
     * We only want to add federation to types that implement the Node
     * interface, and aren't the Query root type.
     */
    if (isRootQuery || !NodeInterface || !interfaces.includes(NodeInterface)) {
      return interfaces;
    }

    // Add this to the list of types to be in the _Entity union
    build.graphqlObjectTypesForEntityType.push(Self);

    /*
     * We're going to add the `@key(fields: "nodeId")` directive to this type.
     * First, we need to generate an `astNode` as if the type was generated
     * from a GraphQL SDL initially; then we assign this astNode to to the type
     * (via type mutation, ick) so that Apollo Federation's `printSchema` can
     * output it.
     */
    const astNode = {
      ...ObjectTypeDefinition(spec),
      ...Self.astNode,
    };

    astNode.directives.push(
      Directive("key", { fields: StringValue(nodeIdFieldName) }),
    );

    Self.astNode = astNode;

    // We're not changing the interfaces, so return them unmodified.
    return interfaces;
  });

  // Add our collected types to the _Entity union
  builder.hook("GraphQLUnionType:types", (types, build, context) => {
    // If it's not the _Entity union, don't change it.
    if (context.Self.name !== "_Entity") {
      return types;
    }

    // Add our types to the entity types
    return [
      ...types,
      ...new Set(build.graphqlObjectTypesForEntityType),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any[];
  });
};

/*
 * This plugin remove query/node/nodeId fields and Node interface from Query type to
 * fix `GraphQLSchemaValidationError: There can be only one type named "query/node/nodeId"` error.
 * This helps Apollo Gateway to consume two or more PostGraphile services.
 */

const RemoveQueryLegacyFeaturesPlugin: Plugin = builder => {
  builder.hook('GraphQLObjectType:fields', (fields, _, context) => {
    const {
      scope: { isRootQuery },
    } = context;

    // Deleting the query, node, nodeId fields from the Query type that are used by
    // the old relay specification which are not needed for modern GraphQL clients
    if (isRootQuery) {
      delete fields.query;
      delete fields.node;
      delete fields.nodeId;
    }

    return fields;
  });

  builder.hook('GraphQLObjectType:interfaces', (interfaces, _, context) => {
    if (!context.scope.isRootQuery) {
      return interfaces;
    }
    // Delete all interfaces (i.e. the Node interface) from Query.
    return [];
  });
};



// Our federation implementation combines these two plugins:
export default makePluginByCombiningPlugins(
  SchemaExtensionPlugin,
  AddKeyPlugin,
  RemoveQueryLegacyFeaturesPlugin
);
