'use strict';
const debug = require('debug')('transom:mongoose:openapi');

// 
module.exports = function OpenApiMeta(server, options) {
    const openapiIgnore = options.ignore || [];
    const openapiSecurity = options.security || {};

    // Map Transom datatypes to OpenApi datatype schemas.
    function instanceTypes(instance) {
        const schema = {};
        switch (instance.toLowerCase()) {
            case 'boolean':
                schema.type = "boolean";
                break;
            case 'date':
                schema.type = "string";
                schema.format = "date";
                break;
            case 'datetime':
                schema.type = "string";
                schema.format = "date-time";
                break;
            case 'number':
            case 'integer':
            case 'int32':
                schema.type = "integer";
                schema.format = "int32";
                break;
            case 'int64':
                schema.type = "integer";
                schema.format = "int64";
                break;
            case 'float':
                schema.type = "number";
                schema.format = "float";
                break;
            case 'double':
                schema.type = "number";
                schema.format = "double";
                break;
            case 'string':
            case 'connector':
            case 'objectid':
            default:
                schema.type = 'string';
        }
        return schema;
    }

    function getSelectParameter(routeEntity) {
        return {
            description: `A comma delimited list of ${routeEntity} attributes to be included in the results.`,
        };
    }

    function insertMeta(route, routeEntity) {
        const urlParameters = {};
        const extraParameters = {};
        const ignoreParameters = ['*'];
        const successResponse = {
            description: `A copy of the newly inserted ${routeEntity} object`,
            content: {
                'application/json': {
                    schema: {
                        // TODO: Provide a schema that excludes the _id and timestamps!
                        '$ref': `#/components/schemas/${routeEntity}-single`
                    }
                }
            }
        };
        return endpointMeta(route, 'insert', urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    function findBinaryMeta(route, routeEntity) {
        const urlParameters = {
            ":__id": {
                description: `Id of the ${routeEntity} record with a binary attachment.`
            },
            ":__attribute": {
                description: `Field on the ${routeEntity} where binary data is stored.`
            },
            ":__filename": {
                description: `The name of the file uploaded into to the binary data attribute.`
            }
        };
        const extraParameters = {
            "_select": getSelectParameter(routeEntity)
        };
        const ignoreParameters = ['*']; // ignore all the model attributes
        const successResponse = {
            description: `A file object whose mime-type depends on the name of the uploaded file.`,
            content: {
                '*': {
                    schema: {
                        type: 'string',
                        format: 'binary'
                    }
                }
            }
        };
        return endpointMeta(route, `find${routeEntity}Binary`, urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    function findByIdMeta(route, routeEntity) {
        const urlParameters = {
            ":__id": {
                description: `Id of the ${routeEntity} to fetch.`,
            }
        };
        const extraParameters = {
            "_select": getSelectParameter(routeEntity)
        };
        const ignoreParameters = ['*']; // ignore all the model attributes
        const successResponse = {
            description: `A ${routeEntity} object`,
            content: {
                'application/json': {
                    schema: {
                        '$ref': `#/components/schemas/${routeEntity}-single`
                    }
                }
            }
        };
        return endpointMeta(route, 'findById', urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    function findMeta(route, routeEntity) {
        const urlParameters = {};
        const extraParameters = {
            "_select": getSelectParameter(routeEntity),
            "_skip": {
                description: `The number of records to be skipped in the results.`,
            },
            "_limit": {
                description: `Limit the number of ${routeEntity} records to be returned in the results.`,
            },
            "_sort": {
                description: `The name of an attribute to sort the results. Prefix with "-" to sort descending.`,
            }
        };
        const ignoreParameters = [];
        const successResponse = {
            description: `An Array of ${routeEntity} objects`,
            content: {
                'application/json': {
                    schema: {
                        '$ref': `#/components/schemas/${routeEntity}-list`
                    }
                }
            }
        };
        return endpointMeta(route, 'find', urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    function findCountMeta(route, routeEntity) {
        const urlParameters = {};
        const extraParameters = {};
        const ignoreParameters = [];
        const successResponse = {
            description: `An Array of ${routeEntity} objects`,
            content: {
                'application/json': {
                    schema: {
                        '$ref': `#/components/schemas/${routeEntity}-list`
                    }
                }
            }
        };
        return endpointMeta(route, 'findCount', urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    function updateByIdMeta(route, routeEntity) {
        const urlParameters = {
            ":__id": {
                description: `Id of the ${routeEntity} to update.`,
            }
        };
        const extraParameters = {};
        const ignoreParameters = ['*'];
        const successResponse = {
            description: `A ${routeEntity} object`,
            content: {
                'application/json': {
                    schema: {
                        // TODO: Provide a schema that excludes the _id and timestamps!
                        '$ref': `#/components/schemas/${routeEntity}-single`
                    }
                }
            }
        };
        return endpointMeta(route, 'updateById', urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    function deleteMeta(route, routeEntity) {
        const urlParameters = {};
        const extraParameters = {};
        const ignoreParameters = [];
        const successResponse = {
            description: `An Array of ${routeEntity} objects`,
            content: {
                'application/json': {
                    schema: {
                        '$ref': `#/components/schemas/${routeEntity}-list`
                    }
                }
            }
        };
        return endpointMeta(route, 'delete', urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    function deleteBatchMeta(route, routeEntity) {
        const urlParameters = {};
        const extraParameters = {};
        const ignoreParameters = [];
        const successResponse = {
            description: `An Array of ${routeEntity} Ids`,
            content: {
                'application/json': {
                    schema: {
                        '$ref': `#/components/schemas/${routeEntity}-list`
                    }
                }
            }
        };
        return endpointMeta(route, 'deleteBatch', urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    function deleteByIdMeta(route, routeEntity) {
        const urlParameters = {
            ":__id": {
                description: `Id of the ${routeEntity} to update.`,
            }
        };
        const extraParameters = {};
        const ignoreParameters = ['*'];
        const successResponse = {
            description: `An object that indicates the number of {routeEntity} records deleted.`,
            content: {
                'application/json': {
                    schema: {
                        '$ref': `#/components/schemas/delete`
                    }
                }
            }
        };
        return endpointMeta(route, 'deleteById', urlParameters, extraParameters, ignoreParameters, successResponse);
    }

    // Return a function to be evaluated *after* all plugins are loaded.
    function endpointMeta(route, operationId, urlParameters, extraParameters, ignoreParameters, successResponse) {
        const entity = route.entity;
        const entityObj = route.entityObj;
        const routeMeta = (typeof route.routes[operationId] === 'object' ? route.routes[operationId].meta : null) || {};
        const mongoose = route.mongoose;
        const urlParams = urlParameters || {};
        const extraParams = extraParameters || {};
        const ignoreParams = (typeof ignoreParameters === 'string' ? [ignoreParameters] : ignoreParameters) || [];

        return function () {
            debug(`OpenApi ${this.method} endpoint meta for ${entity}.`);
            const entityMeta = entityObj.meta || {};
            const meta = {
                summary: routeMeta.summary || entityMeta.summary || `Execute ${this.method} request with ${entity}.`,
                description: routeMeta.description || entityMeta.description || null,
                operationId: `${operationId}-${entity}`,
                tags: [entity],
                parameters: [],
                schemas: {},
                security: {},
                responses: {}
            }
            if (this.method === 'post' || this.method === 'put' || this.method === 'patch') {
                meta.requestBody = {};
                meta.requestBody.description = `${this.method === 'post' ? 'Insert' : 'Update'} a ${entity}.`;
                meta.requestBody.required = true;
                meta.requestBody.content = {
                    'application/json': {
                        schema: {
                            $ref: `#/components/schemas/${entity}-single`
                        }
                    },
                    'application/x-www-form-urlencoded': {
                        schema: {
                            $ref: `#/components/schemas/${entity}-single`
                        }
                    }
                };
            }
            // Add any url parameters!
            Object.keys(urlParams).map((param) => {
                urlParams[param].name = param;
                urlParams[param].in = 'path';
                urlParams[param].required = true;
                meta.parameters.push(urlParams[param]);
            });
            // Add any extra parameters!
            Object.keys(extraParams).map((param) => {
                extraParams[param].name = param;
                extraParams[param].in = 'query';
                extraParams[param].required = false;
                meta.parameters.push(extraParams[param]);
            });
            // Add any security!
            Object.keys(openapiSecurity).map((param) => {
                meta.security[param] = openapiSecurity[param];
            });

            const model = mongoose.models[route.modelPrefix + route.modelName];
            if (model) {
                if (ignoreParams.includes('*')) {
                    debug(`OpenApi skipping all attributes from ${entity}`);
                } else {
                    const schema = {};
                    schema.required = []; // array of mandatory field names
                    schema.properties = {}; // attributes w/ openapi datatype schemas
                    const connectors = [];

                    Object.keys(model.schema.paths).map((attribute) => {
                        if (ignoreParams.includes(attribute) ||
                            openapiIgnore.includes(attribute) ||
                            openapiIgnore.includes(`${entity}.${attribute}`)) {
                            debug(`OpenApi skipping attribute ${entity}.${attribute}`);
                        } else {
                            if (model.schema.paths[attribute].isRequired) {
                                schema.required.push(attribute);
                            }
                            const transomSchemaType = model.schema.paths[attribute].options.__type || model.schema.paths[attribute].instance;
                            if (transomSchemaType === 'connector' && model.schema.paths[attribute].options.__connectEntity) {
                                connectors.push(attribute);
                            }
                            schema.properties[attribute] = instanceTypes(transomSchemaType);
                            const parameter = {
                                name: attribute,
                                in: 'query',
                                description: model.schema.paths[attribute].options.__description || `${attribute} description not provided`,
                                required: false,
                                schema: instanceTypes(transomSchemaType)
                            };
                            meta.parameters.push(parameter);
                        }
                    });
                    if (connectors.length) {
                        const parameter = {
                            name: '_connect',
                            in: 'query',
                            description: `Name of the related attribute(s): ${connectors.join(', ')}`,
                            required: false,
                            schema: instanceTypes('string')
                        };
                        meta.parameters.push(parameter);
                    }
                    meta.schemas[`${entity}-single`] = schema;
                }
                // These schemas should always get included.
                meta.schemas['error'] = {
                    "required": [
                        "code",
                        "message"
                    ],
                    "properties": {
                        "code": {
                            "type": "string"
                        },
                        "message": {
                            "type": "string"
                        }
                    }
                };
                meta.schemas['delete'] = {
                    "required": [
                        "deleted"
                    ],
                    "properties": {
                        "deleted": {
                            "type": "integer"
                        }
                    }
                };
                meta.responses['200'] = successResponse;
                meta.responses['default'] = {
                    "description": "unexpected error",
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": "#/components/schemas/error"
                            }
                        }
                    }
                };
            } else {
                debug(`OpenApi did not find a mongoose model for '${route.modelPrefix + route.modelName}'.`);
            }
            return meta;
        };
    }

    return {
        instanceTypes,
        getSelectParameter,
        insertMeta,
        findBinaryMeta,
        findByIdMeta,
        findMeta,
        findCountMeta,
        updateByIdMeta,
        deleteMeta,
        deleteBatchMeta,
        deleteByIdMeta,
        endpointMeta
    };
}