// Vendored copy of ontology/schema.json so the compiled package is self-contained
// when installed from npm or bundled into a container. The build step copies this
// JSON into dist/ alongside schema.js; a test asserts it stays in sync with the
// canonical ontology/schema.json.
import schemaJson from "./schema.json" with { type: "json" };

export const schema = schemaJson;
