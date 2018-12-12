# @transomjs/transom-mongoose change log

## 1.8.5
- Given that Restify doesn't support parsing multipart requests containing Array or Object data, Ive updated to allow sending stringified JSON in multipart requests for Insert & Update; To be used with Array, Point and Mixed attributes. Binary data should not be stringified.

## 1.8.4
- Added the geoJSON 'point' data type, requires custom schema typeKey values everywhere. Sets up groundwork for geo queries and more geo datatypes.

## 1.8.2
- fixed the constants handling for 'created_by' and 'updated_by' on insert. They are defined as type 'String' as opposed to 'string' which caused an error.

## 1.8.1
- Updated the server to wrap Restify, and emit events when routes are added. Events will be used (See: @transomjs/transom-openapi) used to collect metadata about each route for use generating an OpenApi file for Swagger.

## 1.8.0
- Updated dependencies to the latest versions & rebuilt the package-lock.json
- Fixed CURRENT_USER bug in the transom acl plugin
- Fixed deleteById results, a side-effect of the mongoose upgrade

## 1.8.0-0
- Updated dependencies to the latest versions & rebuilt the package-lock.json
- Updated to the latest mongoose 5.2.15
- Added deploy task to package.json

## earlier
- Working as documented and not previously change-logged.
