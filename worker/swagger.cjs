// The Worker never builds the OpenAPI document at runtime: it is generated at build time
// (scripts/generate-openapi.mjs, with the real @nestjs/swagger) and served as a static asset.
// Running every @Api* decorator during isolate startup only costs startup CPU, so the bundle
// gets these no-ops instead. The mapped types keep their validation/transform behaviour via
// @nestjs/mapped-types (what @nestjs/swagger builds on), minus the OpenAPI metadata.
const mapped = require('@nestjs/mapped-types');

const noop = () => () => undefined;

module.exports = {
  ApiProperty: noop,
  ApiPropertyOptional: noop,
  ApiResponseProperty: noop,
  ApiHideProperty: noop,
  ApiOperation: noop,
  ApiTags: noop,
  ApiBearerAuth: noop,
  ApiHeader: noop,
  ApiHeaders: noop,
  ApiParam: noop,
  ApiQuery: noop,
  ApiBody: noop,
  ApiResponse: noop,
  ApiOkResponse: noop,
  ApiCreatedResponse: noop,
  ApiExtraModels: noop,
  ApiExcludeEndpoint: noop,
  ApiExcludeController: noop,
  ApiConsumes: noop,
  ApiProduces: noop,
  ApiSecurity: noop,
  PartialType: mapped.PartialType,
  OmitType: mapped.OmitType,
  PickType: mapped.PickType,
  IntersectionType: mapped.IntersectionType,
};
