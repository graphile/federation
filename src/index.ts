import {
  AugmentedGraphQLFieldResolver,
  ObjectFieldResolver,
  makeExtendSchemaPlugin,
  makePluginByCombiningPlugins,
  gql,
} from "graphile-utils";
import { Build, Plugin } from "graphile-build";
import { DirectiveNode } from "graphql";
import printFederatedSchema from "./printFederatedSchema";
import { ObjectTypeDefinition, Directive, StringValue } from "./AST";

/**
 * This function allows users to create their own version of the schema plugin.
 */
export function makeFederationSchemaPlugin<TSource = any, TContext = any>(
  generator: (
    build: Build
  ) =>
    | AugmentedGraphQLFieldResolver<TSource, TContext>
    | ObjectFieldResolver<TSource, TContext>
): Plugin {
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
      $$isQuery,
      $$nodeType,
      getTypeByName,
      inflection,
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
          _entities: generator(build),
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
   * This plugin adds types to the _Entity union defined above.
   */
  const EntityPlugin: Plugin = builder => {
    // Add our collected types to the _Entity union
    builder.hook("GraphQLUnionType:types", (types, build, context) => {
      const { Self } = context;
      // If it's not the _Entity union, don't change it.
      if (Self.name !== "_Entity") {
        return types;
      }

      // If it's not the _Entity union, don't change it.
      if (Self.name !== "_Entity") {
        return types;
      }
      const { scopeByType } = build;

      const newTypes = [...types];
      for (const [type] of scopeByType) {
        if (
          type.astNode &&
          type.astNode.directives &&
          type.astNode.directives.some(
            (directive: DirectiveNode) => directive.name.value === "key"
          )
        ) {
          newTypes.push(type);
        }
      }

      // Add our types to the entity types
      return newTypes;
    });
  };

  return makePluginByCombiningPlugins(SchemaExtensionPlugin, EntityPlugin);
}

/**
 * This plugin adds the federation-specific schema parts for resolving entities by nodeId.
 */
const FederationSchemaNodeIdPlugin = makeFederationSchemaPlugin(build => {
  const { resolveNode, nodeIdFieldName } = build;
  return (data, { representations }, context, resolveInfo) => {
    const {
      graphile: { fieldContext },
    } = resolveInfo;
    return representations.map((representation: any) => {
      if (!representation || typeof representation !== "object") {
        throw new Error("Invalid representation");
      }
      const { __typename, [nodeIdFieldName]: nodeId } = representation;
      if (!__typename || typeof nodeId !== "string") {
        throw new Error("Failed to interpret representation");
      }
      return resolveNode(
        nodeId,
        build,
        fieldContext,
        data,
        context,
        resolveInfo
      );
    });
  };
});

/*
 * This plugin adds the `@key(fields: "nodeId")` directive to the types that
 * implement the Node interface and marks them to be added to the _Entity union.
 */
const AddKeyNodeIdPlugin: Plugin = builder => {
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

    /*
     * We're going to add the `@key(fields: "nodeId")` directive to this type.
     * First, we need to generate an `astNode` as if the type was generateted
     * from a GraphQL SDL initially; then we assign this astNode to to the type
     * (via type mutation, ick) so that Apollo Federation's `printSchema` can
     * output it.
     */
    const astNode = {
      ...ObjectTypeDefinition(spec),
      ...Self.astNode,
    };
    astNode.directives.push(
      Directive("key", { fields: StringValue(nodeIdFieldName) })
    );
    Self.astNode = astNode;

    // We're not changing the interfaces, so return them unmodified.
    return interfaces;
  });
};

export default makePluginByCombiningPlugins(
  FederationSchemaNodeIdPlugin,
  AddKeyNodeIdPlugin
);
