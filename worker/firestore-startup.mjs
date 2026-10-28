import { FirestoreClient } from '@google-cloud/firestore/build/src/v1/firestore_client.js';
import gax from 'google-gax/build/src/fallback.js';
import statusSchema from 'google-gax/build/protos/status.json';

// Workers permits protobuf code generation only during module initialization.
// Populate the same REST schema cache used by the lazy Firebase Admin client.
new FirestoreClient({ fallback: 'rest', projectId: 'odivon-main-api-a2095' }, gax);
function prepare(namespace) {
  if (namespace instanceof gax.protobuf.Type) namespace.setup();
  for (const child of namespace.nestedArray ?? []) prepare(child);
}
// Generating code for a type is the most expensive step of isolate startup, so the client roots
// only prepare what a call can touch: the request/response types of every RPC and the types
// their fields reach. The rest (descriptor.proto, google.api annotations) is never instantiated.
function prepareType(type, done) {
  if (!(type instanceof gax.protobuf.Type) || done.has(type)) return;
  done.add(type);
  type.setup();
  for (const field of type.fieldsArray) prepareType(field.resolvedType, done);
}
function prepareServices(namespace, done) {
  if (namespace instanceof gax.protobuf.Service) {
    for (const method of namespace.methodsArray) {
      prepareType(method.resolvedRequestType, done);
      prepareType(method.resolvedResponseType, done);
    }
  }
  for (const child of namespace.nestedArray ?? []) prepareServices(child, done);
}
for (const root of gax.GrpcClient.protoCache.values()) {
  root.resolveAll();
  prepareServices(root, new Set());
}

// gax constructs its error decoder for each failed request. Reuse only this
// immutable schema so error handling also avoids code generation in requests.
const fromJSON = gax.protobuf.Root.fromJSON;
const statusRoot = fromJSON(statusSchema);
statusRoot.resolveAll();
prepare(statusRoot);
gax.protobuf.Root.fromJSON = function (json, root) {
  if (json === statusSchema && !root) return statusRoot;
  return fromJSON.call(this, json, root);
};
