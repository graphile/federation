/*
 * These helpers help us to construct AST nodes required for Apollo
 * Federation's printSchema to work.
 */
export function Name(value: string) {
  return {
    kind: "Name",
    value,
  };
}

export function StringValue(value: string, block = false) {
  return {
    kind: "StringValue",
    value,
    block,
  };
}

export function ObjectTypeDefinition(spec: {
  name: string;
  description?: string | null;
}) {
  return {
    kind: "ObjectTypeDefinition",
    name: Name(spec.name),
    description: spec.description
      ? StringValue(spec.description, true)
      : undefined,
    directives: [],
  };
}

export function Directive(name: string, args: { [argName: string]: any } = {}) {
  return {
    kind: "Directive",
    name: Name(name),
    arguments: Object.entries(args).map(([argName, value]) => ({
      kind: "Argument",
      name: Name(argName),
      value,
    })),
  };
}

export function Field(name: string, args: { [argName: string]: any } = {}) {
  return {
    kind: "Field",
    name: Name(name),
    arguments: Object.entries(args).map(([argName, value]) => ({
      kind: "Argument",
      name: Name(argName),
      value,
    })),
    directives: [],
  };
}
