import {
  makeExtendSchemaPlugin,
  makePluginByCombiningPlugins,
  gql,
} from "graphile-utils";
import { Plugin } from "graphile-build";
import printFederatedSchema from "./printFederatedSchema";
import { ObjectTypeDefinition, Directive, StringValue, Field } from "./AST";
import { PgAttribute } from "graphile-build-pg";
import { GraphQLFieldConfig } from "graphql";

/**
 * TODO:
 *  - [ ] Support compound primary keys for federated relations (ie @federated on a GraphQLObjectType with multiple compound keys and @external columns)
 */

/*
 * Sets up storage used by other plugins
 */
const BaseFederatedPlugin: Plugin = builder => {
  builder.hook("build", build => {
    build.federationEntityTypeResolvers = [];
    return build;
  });
};

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
    getTypeByName,
    inflection,
    federationEntityTypeResolvers,
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
      directive @extends on OBJECT | INTERFACE
    `,
    resolvers: {
      Query: {
        async _entities(data, args, resolveContext, resolveInfo) {
          const { representations } = args;

          /**
           * Right now we do one fetch per representation. We could optimize
           * to do one fetch per type.
           */
          const entities = representations.map(async (representation: any) => {
            if (!representation.__typename) {
              throw new Error(
                "Failed to interpret representation. No __typename"
              );
            }

            const schemaType = resolveInfo.schema.getType(
              representation.__typename
            );

            if (!schemaType) {
              throw new Error(
                `Failed to find __typename ${representation.__typename}`
              );
            }

            const resolver =
              federationEntityTypeResolvers[representation.__typename];

            if (!resolver) {
              throw new Error(
                `Failed to find resolver for ${representation.__typename}`
              );
            }

            const result = await resolver.resolve(
              data,
              representation,
              resolveContext,
              resolveInfo
            );

            return {
              ...result,
              __typename: representation.__typename,
            };
          });

          return Promise.all(entities);
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
          if (value === $$isQuery) {
            if (!Query) Query = getTypeByName(inflection.builtin("Query"));
            return Query;
          } else if (value.__typename) {
            return getNullableType(value.__typename);
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
 * Alters the return type of any federated fields and wraps the underlying reducer
 * so a field with a smart comments @federated User(userId) would have its type changed
 * from, say ID, to User and reference the userId column.
 */
const ChangeFederatedReturnTypePlugin: Plugin = builder => {
  builder.hook("GraphQLObjectType:fields:field", (field, build, context) => {
    const {
      scope: { pgFieldIntrospection },
    } = context;
    const { getTypeByName } = build;

    if (
      !pgFieldIntrospection ||
      !pgFieldIntrospection.tags ||
      !pgFieldIntrospection.tags.federated
    ) {
      return field;
    }

    const tag: string = pgFieldIntrospection.tags.federated.trim();
    const originType = tag.substr(0, tag.indexOf("("));
    const fieldDefinition = tag.slice(tag.indexOf("(") + 1, -1);

    const Type = getTypeByName(originType);

    if (!Type) {
      throw new Error(
        `Unknown Federated Type ${originType}. Maybe define it via external types?`
      );
    }

    return {
      description: field.description,
      type: Type,
      resolve: async (source, args, context, resolveInfo) => {
        const result = field.resolve
          ? await field.resolve!(source, args, context, resolveInfo)
          : null;
        return { [fieldDefinition]: result, __typename: originType };
      },
    };
  });
};

/*
 * Adds the @extends directive to any of our externally defined
 * types that have a key so that its printed correctly in the
 * federatedSchema. Also adds federationEntityTypeResolvers as
 * indentity for external types.
 */
const FederateExternalTypesPlugin: Plugin = builder => {
  builder.hook("GraphQLObjectType", (type, build, context) => {
    const {
      scope: { pgIntrospection, directives },
    } = context;

    if (!pgIntrospection && directives) {
      const astNode = {
        ...ObjectTypeDefinition({ name: type.name }),
        ...type.astNode,
      };

      if (directives.key) {
        (astNode.directives as any).push(
          Directive("key", { fields: StringValue(directives.key.fields) })
        );
      }

      if (directives.extends) {
        (astNode.directives as any).push(Directive("extends"));
      }

      return { ...type, astNode } as typeof type;
    }

    return type;
  });

  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const { getTypeByName } = build;
    const {
      Self,
      scope: { pgIntrospection, directives },
      fieldWithHooks,
    } = context;

    const { federationEntityTypeResolvers } = build;

    /** External Type  */
    if (
      !pgIntrospection &&
      directives &&
      directives.key &&
      directives.extends
    ) {
      /* maybe support _resolveReference?? */
      /* We slightly abuse fieldWithHooks here but it seems to work  */
      federationEntityTypeResolvers[Self.name] = fieldWithHooks(
        "__resolveReference",
        {
          type: Self,
          args: {
            representation: getTypeByName("_Any"),
          } /* TODO */,
          resolve(representation: any) {
            return representation;
          },
        },
        {}
      );
    }

    return fields;
  });

  /*
   * Adds external astNode directive to any key fields with an exernal field
   * directive on them
   */
  builder.hook("GraphQLObjectType:fields:field", (field, build, context) => {
    const {
      scope: { pgFieldIntrospection, fieldDirectives, fieldName },
    } = context;

    if (!pgFieldIntrospection && fieldDirectives && fieldDirectives.external) {
      const astNode = {
        ...Field(fieldName!),
        ...field.astNode,
      };

      (astNode.directives as any).push(Directive("external"));
      return { ...field, astNode } as GraphQLFieldConfig<any, any, any>;
    }

    return field;
  });
};

/*
 * This plugin adds the glue for federation of postgres types
 * to work. It adds @key diretive for the primary key, creates
 * the resolveReference function for __entities and adds the type
 * to the _Entity union type
 */
const FederatePgTypesPlugin: Plugin = (builder, { subscriptions }) => {
  builder.hook("build", build => {
    build.federationEntityTypes = [];
    return build;
  });

  /*
   * Adds
   */
  builder.hook("GraphQLObjectType", (type, build, context) => {
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

    const primaryKeyNames = pgIntrospection.primaryKeyConstraint.keyAttributes.map(
      (attr: PgAttribute) => inflection.column(attr)
    );

    if (!primaryKeyNames.length) {
      return type;
    }

    const astNode = {
      ...ObjectTypeDefinition({ name: type.name }),
      ...type.astNode,
    };

    (astNode.directives as any).push(
      Directive("key", { fields: StringValue(primaryKeyNames.join(" ")) })
    );

    return { ...type, astNode } as typeof type;
  });

  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      Self,
      GraphQLObjectType: objectType,
      scope: { pgIntrospection, isPgRowType },
      fieldWithHooks,
    } = context;

    const {
      parseResolveInfo,
      pgGetGqlTypeByTypeIdAndModifier,
      pgGetGqlInputTypeByTypeIdAndModifier,
      gql2pg,
      pgSql: sql,
      graphql: { GraphQLNonNull },
      inflection,
      pgQueryFromResolveData: queryFromResolveData,
      pgOmit: omit,
      pgPrepareAndRun,
      federationEntityTypeResolvers,
    } = build;

    /**
     * Add to the Entity type if we have a key directive. Done for both internal
     * and external types
     */
    if (
      objectType &&
      objectType.astNode &&
      objectType.astNode.directives &&
      objectType.astNode.directives.some(
        (directive: any) => directive.name && directive.name.value === "key"
      )
    ) {
      build.federationEntityTypes.push(Self);
    }

    if (
      !(
        isPgRowType &&
        pgIntrospection.isSelectable &&
        pgIntrospection.namespace &&
        pgIntrospection.primaryKeyConstraint
      )
    ) {
      /* Not a table with a primary key type */
      return fields;
    }

    const table = pgIntrospection;
    const TableType = pgGetGqlTypeByTypeIdAndModifier(table.type.id, null);
    const sqlFullTableName = sql.identifier(table.namespace.name, table.name);

    if (!TableType) {
      throw new Error("Unknown Table Type");
    }

    const constraint = pgIntrospection.primaryKeyConstraint;
    if (omit(constraint, "read")) {
      throw new Error(
        "Cannot resolve reference using a constraint with @omit read"
      );
    }

    const keys = constraint.keyAttributes;
    if (keys.some((key: any) => omit(key, "read"))) {
      throw new Error(
        "Cannot resolve reference using a constraint with a key which has @omit read"
      );
    }

    if (!keys.every((_: any) => _)) {
      throw new Error("Consistency error: could not find an attribute!");
    }

    const keysIncludingMeta = keys.map((key: any) => ({
      ...key,
      sqlIdentifier: sql.identifier(key.name),
      columnName: inflection.column(key),
    }));

    /*
     * We abuse fieldWithHooks here
     */
    federationEntityTypeResolvers[TableType.name] = fieldWithHooks(
      "_resolveReference",
      ({ getDataFromParsedResolveInfoFragment }: any) => {
        return {
          type: TableType,
          args: keysIncludingMeta.reduce(
            (memo: any, { typeId, typeModifier, columnName, name }: any) => {
              const InputType = pgGetGqlInputTypeByTypeIdAndModifier(
                typeId,
                typeModifier
              );
              if (!InputType) {
                throw new Error(
                  `Could not find input type for key '${name}' on type '${TableType.name}'`
                );
              }
              memo[columnName] = {
                type: new GraphQLNonNull(InputType),
              };
              return memo;
            },
            {}
          ),
          async resolve(
            data: any,
            args: any,
            resolveContext: any,
            resolveInfo: any
          ) {
            /*
             * Pretty much the same as PgRowByUniqueConstraint
             */
            const { pgClient } = resolveContext;

            // Precomputation for performance
            const queryFromResolveDataOptions = {
              useAsterisk: false, // Because it's only a single relation, no need
            };

            const queryFromResolveDataCallback = (
              queryBuilder: any,
              args: any
            ) => {
              if (subscriptions && table.primaryKeyConstraint) {
                queryBuilder.selectIdentifiers(table);
              }
              const sqlTableAlias = queryBuilder.getTableAlias();

              keysIncludingMeta.forEach(
                ({ sqlIdentifier, columnName, type, typeModifier }: any) => {
                  queryBuilder.where(
                    sql.fragment`${sqlTableAlias}.${sqlIdentifier} = ${gql2pg(
                      args[columnName],
                      type,
                      typeModifier
                    )}`
                  );
                }
              );
            };

            const parsedResolveInfoFragment = parseResolveInfo(resolveInfo);
            const resolveData = getDataFromParsedResolveInfoFragment(
              parsedResolveInfoFragment,
              TableType
            );

            const query = queryFromResolveData(
              sqlFullTableName,
              undefined,
              resolveData,
              queryFromResolveDataOptions,
              (queryBuilder: any) =>
                queryFromResolveDataCallback(queryBuilder, args),
              resolveContext,
              resolveInfo.rootValue
            );

            const { text, values } = sql.compile(query);
            const {
              rows: [row],
            } = await pgPrepareAndRun(pgClient, text, values);

            return row;
          },
        };
      },
      {}
    );

    return fields;
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
  BaseFederatedPlugin,
  SchemaExtensionPlugin,
  ChangeFederatedReturnTypePlugin,
  FederateExternalTypesPlugin,
  FederatePgTypesPlugin
);
