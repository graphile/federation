import { Build } from "graphile-build";
import { PgAttribute, QueryBuilder, SQLGen } from "graphile-build-pg";

/**
 * The default federation resolve reference.
 * @param representation The federation representation.
 * @param context The context.
 * @param resolveInfo The resolve info.
 * @returns The resolved representation value.
 */
export async function defaultResolveReference(
  build: Build,
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
  representation: any,
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
  context: any,
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
  resolveInfo: any,
): Promise<unknown> {
  const {
    getTypeByName,
    scopeByType,
    inflection,
    nodeIdFieldName,
    pgSql: sql,
    parseResolveInfo,
    pgQueryFromResolveData: queryFromResolveData,
    pgPrepareAndRun,
  } = build;

  const { pgClient } = context;

  const {
    graphile: { fieldContext },
  } = resolveInfo;

  const {
    __typename,
    [nodeIdFieldName]: nodeId,
    ...representationKeys
  } = representation;

  const type = getTypeByName(__typename);

  if (!type) {
    throw new Error(
      // eslint-disable-next-line max-len
      `The _entities resolver tried to load an entity for type "${__typename}", but no object type of that name was found in the database schema`,
    );
  }

  function filterByType(
    object: Record<string, unknown>,
    typeName: string,
    parent: Record<string, unknown>,
  ): Record<string, unknown> {
    let result: Record<string, unknown> = {};

    for (const property in object) {
      if (property == typeName && parent.fieldsByTypeName) {
        result = parent;
        break;
      }

      if (typeof object[property] === "object") {
        result =
          Object.keys(result).length === 0
            ? filterByType(
                object[property] as Record<string, unknown>,
                typeName,
                object,
              )
            : result;
      }
    }

    return result;
  }

  const { pgIntrospection: table } = scopeByType.get(type);

  // Check if the representation key(s) exist in the type.
  if (
    !table?.attributes?.some(
      (attribute: PgAttribute) =>
        representationKeys[inflection.column(attribute)] != undefined || null,
    )
  ) {
    throw new Error("Incorrect representation key(s)");
  }

  let whereClause: SQLGen;

  // If multiple representation keys are present,
  // treat them as `OR` logic. Return after the first match.
  for (const representationKey in representationKeys) {
    // Get pg column attribute.
    const attr = table.attributes.find(
      (attribute: PgAttribute) =>
        inflection.column(attribute) === representationKey,
    );

    // If we can't find the user specified representation key,
    // skip to the next representation key.
    if (!attr) {
      continue;
    }

    whereClause = sql.fragment`${sql.identifier(attr.name)} = ${sql.value(
      representationKeys[representationKey],
    )}`;

    // Stop looping. We only want to return first match.
    break;
  }

  // Filter nested resolve info to only the type we need.
  // If we don't do this, we won't be able to get to deeply nested types
  // since the built-in `fieldContext.getDataFromParsedResolveInfoFragment`
  // function only parses down two levels.
  const parsedResolveInfo_filtered = filterByType(
    parseResolveInfo(resolveInfo),
    __typename,
    {},
  );

  const resolveData = fieldContext.getDataFromParsedResolveInfoFragment(
    parsedResolveInfo_filtered,
    type,
  );

  const query = queryFromResolveData(
    sql.identifier(table.namespace.name, table.name),
    undefined,
    resolveData,
    {
      useAsterisk: false, // Because it's only a single relation, no need
    },
    (queryBuilder: QueryBuilder) => {
      queryBuilder.where(whereClause);
    },
    context,
    resolveInfo.rootValue,
  );

  const { text, values } = sql.compile(query);
  const { rows } = await pgPrepareAndRun(pgClient, text, values);

  return rows.length > 1 ? rows : rows[0];
}
