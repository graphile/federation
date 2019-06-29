import {
  makeExtendSchemaPlugin,
  makePluginByCombiningPlugins,
  gql,
} from "graphile-utils";
import { Plugin } from "graphile-build";
import { printSchema } from "@apollo/federation";

let lastSchema: any;
let lastPrint: string;
const memoizedPrintSchema = (schema: any) => {
  if (schema !== lastSchema) {
    lastSchema = schema;
    lastPrint = printSchema(schema);
  }
  return lastPrint;
};

const SchemaExtensionPlugin = makeExtendSchemaPlugin(build => {
  const {
    graphql: { GraphQLScalarType, getNullableType },
    resolveNode,
    $$isQuery,
    $$nodeType,
    getTypeByName,
    inflection,
  } = build;
  // Cache
  let Query: any;
  return {
    typeDefs: gql`
      scalar _Any

      """
      Used to represent a set of fields. Grammatically, a field set is a selection set minus the braces.
      """
      scalar _FieldSet

      # a union of all types that use the @key directive
      union _Entity

      type _Service {
        sdl: String
      }

      extend type Query {
        _entities(representations: [_Any!]!): [_Entity]!
        _service: _Service!
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
          return representations.map((nodeId: string) =>
            resolveNode(nodeId, build, fieldContext, data, context, resolveInfo)
          );
        },

        _service(_, _args, _context, { schema }) {
          return schema;
        },
      },

      _Service: {
        sdl(schema) {
          return memoizedPrintSchema(schema);
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

function Name(value: string) {
  return {
    kind: "Name",
    value,
  };
}

function StringValue(value: string, block = false) {
  return {
    kind: "StringValue",
    value,
    block,
  };
}

const AddKeyPlugin: Plugin = builder => {
  builder.hook("build", build => {
    build.federationEntityTypes = [];
    return build;
  });

  builder.hook("GraphQLObjectType:interfaces", (interfaces, build, context) => {
    const { getTypeByName, inflection, nodeIdFieldName } = build;
    const { GraphQLObjectType: spec, Self } = context;
    const NodeInterface = getTypeByName(inflection.builtin("Node"));
    if (!NodeInterface || !interfaces.includes(NodeInterface)) {
      return interfaces;
    }
    build.federationEntityTypes.push(Self);
    const astNode = {
      kind: "ObjectTypeDefinition",
      name: Name(spec.name),
      description: spec.description
        ? StringValue(spec.description, true)
        : undefined,
      directives: [],
      ...Self.astNode,
    };
    astNode.directives.push({
      kind: "Directive",
      name: Name("key"),
      arguments: [
        {
          kind: "Argument",
          name: Name("fields"),
          value: StringValue(nodeIdFieldName),
        },
      ],
    });
    Self.astNode = astNode;
    return interfaces;
  });

  builder.hook("GraphQLUnionType:types", (types, build, context) => {
    const { Self } = context;
    if (Self.name !== "_Entity") {
      return types;
    }
    const { federationEntityTypes } = build;
    return [...types, ...federationEntityTypes];
  });
};

export default makePluginByCombiningPlugins(
  SchemaExtensionPlugin,
  AddKeyPlugin
);
