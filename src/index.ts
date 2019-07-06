import {
  makeExtendSchemaPlugin,
  makePluginByCombiningPlugins,
  gql,
} from "graphile-utils";
import { Plugin } from "graphile-build";
import printFederatedSchema from "./printFederatedSchema";
import { ObjectTypeDefinition, Directive, StringValue } from "./AST";

/**
 * This plugin installs the schema outlined in the Apollo Federation spec, and
 * the resolvers and types required. Comments have been added to make things
 * clearer for consumers, and the Apollo fields have been deprecated so that
 * users unconcerned with federation don't get confused.
 *
 * https://www.apollographql.com/docs/apollo-server/federation/federation-spec/#federation-schema-specification
 */
const SchemaExtensionPlugin = makeExtendSchemaPlugin(build => {
  const {
    graphql: { GraphQLScalarType, getNullableType },
    resolveNode,
    $$isQuery,
    $$nodeType,
    getTypeByName,
    scopeByType,
    inflection,
    nodeIdFieldName,
    getNodeIdForTypeAndIdentifiers,
  } = build;
  // Cache
  let Query: any;
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
        The GraphQL Schema Language definiton of our endpoint including the
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
          return representations.map((representation: any) => {
            if (!representation || typeof representation !== "object") {
              throw new Error("Invalid representation");
            }

            const { __typename } = representation;
            if (!__typename) {
              throw new Error(
                "Failed to interpret representation, no typename"
              );
            }

            if (nodeIdFieldName in representation) {
              const { [nodeIdFieldName]: nodeId } = representation;
              if (typeof nodeId !== "string") {
                throw new Error(
                  "Failed to interpret representation, invalid nodeId"
                );
              }

              return resolveNode(
                nodeId,
                build,
                fieldContext,
                data,
                context,
                resolveInfo
              );
            } else {
              // This only works with NodePlugin enabled
              if (!getNodeIdForTypeAndIdentifiers) {
                throw new Error("Failed to resolve node by identifiers");
              }

              const type = getTypeByName(__typename);
              const {
                pgIntrospection: {
                  primaryKeyConstraint: { keyAttributes: attrs },
                },
              } = scopeByType.get(type);
              const keyNames = attrs.map(attr => inflection.column(attr));
              const identifiers = keyNames.map(name => representation[name]);

              const nodeId = getNodeIdForTypeAndIdentifiers.call(
                build,
                type,
                ...identifiers
              );

              return resolveNode(
                nodeId,
                build,
                fieldContext,
                data,
                context,
                resolveInfo
              );
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
          // This uses the same resolution as the Node interface, which can be found in graphile-build's NodePlugin
          if (value === $$isQuery) {
            if (!Query) Query = getTypeByName(inflection.builtin("Query"));
            return Query;
          } else if (value[$$nodeType]) {
            return getNullableType(value[$$nodeType]);
          }
        },
      },

      _Any: new GraphQLScalarType({
        name: "_Any",
        serialize(value: any) {
          return value;
        },
      }),
    },
  };
});

/*
 * This plugin adds the `@key(fields: "nodeId")` directive to the types that
 * implement the Node interface, and adds these types to the _Entity union
 * defined above.
 */
const AddKeyPlugin: Plugin = builder => {
  builder.hook("build", build => {
    build.federationEntityTypes = [];
    return build;
  });

  // Find out what types implement the Node interface
  builder.hook("GraphQLObjectType:interfaces", (interfaces, build, context) => {
    const { getTypeByName, inflection, nodeIdFieldName } = build;
    const {
      GraphQLObjectType: spec,
      Self,
      scope: { isRootQuery, pgIntrospection },
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
    build.federationEntityTypes.push(Self);

    /*
     * We're going to add the key directive to this type. If this type has a
     * defined primary key we will use that, otherwise `@key(fields: "nodeId")`
     * First, we need to generate an `astNode` as if the type was generateted
     * from a GraphQL SDL initially; then we assign this astNode to to the type
     * (via type mutation, ick) so that Apollo Federation's `printSchema` can
     * output it.
     */
    const astNode = {
      ...ObjectTypeDefinition(spec),
      ...Self.astNode,
    };

    const {
      primaryKeyConstraint: { keyAttributes },
    } = pgIntrospection;
    const primaryKeyNames = keyAttributes.map(attr => inflection.column(attr));
    const keyName = primaryKeyNames.length
      ? primaryKeyNames.join(" ")
      : nodeIdFieldName;

    astNode.directives.push(Directive("key", { fields: StringValue(keyName) }));
    Self.astNode = astNode;

    // We're not changing the interfaces, so return them unmodified.
    return interfaces;
  });

  // Add our collected types to the _Entity union
  builder.hook("GraphQLUnionType:types", (types, build, context) => {
    const { Self } = context;
    // If it's not the _Entity union, don't change it.
    if (Self.name !== "_Entity") {
      return types;
    }
    const { federationEntityTypes } = build;

    // Add our types to the entity types
    return [...types, ...federationEntityTypes];
  });
};

// Our federation implementation combines these two plugins:
export default makePluginByCombiningPlugins(
  SchemaExtensionPlugin,
  AddKeyPlugin
);
