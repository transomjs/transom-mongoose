'use strict';
const debug = require('debug')('transom:mongoose:openapi');

// 
module.exports = function OpenApiMeta(server, options) {
    const openapiIgnore = options.ignore || [];

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

    function insertMeta(route, routeEntity) {
        const urlParameters = {};
        const extraParameters = {};
        const modelParameters = ['*'];
        return endpointMeta(route, 'insert', urlParameters, extraParameters, modelParameters);
    }

    function findBinaryMeta(route, routeEntity) {
        const urlParameters = {
            ":__id": {
                description: `Id of the ${routeEntity} record with a binary attachment.`
            },
            ":__attribute": {
                description: `Field on the ${routeEntity} where the binary data is stored.`
            },
            ":__filename": {
                description: `The filename assigned to the binary .`
            }
        };
        const extraParameters = {
            "_select": {
                description: `A comma delimited list of ${routeEntity} attributes to include in the results.`,
            }
        };
        const modelParameters = ['*'];
        return endpointMeta(route, `find${routeEntity}Binary`, urlParameters, extraParameters, modelParameters);
    }

    function findByIdMeta(route, routeEntity) {
        const urlParameters = {
            ":__id": {
                description: `Id of the ${routeEntity} to fetch.`,
            }
        };
        const extraParameters = {
            "_select": {
                description: `A comma delimited list of ${routeEntity} attributes to include in the results.`,
            }
        };
        const modelParameters = ['*'];
        return endpointMeta(route, 'findById', urlParameters, extraParameters, modelParameters);
    }

    function findMeta(route, routeEntity) {
        const urlParameters = {};
        const extraParameters = {
            "_select": {
                description: `A comma delimited list of ${routeEntity} attributes to include in the results.`,
            },
            "_skip": {
                description: `The number of records to be skipped in the results.`,
            },
            "_limit": {
                description: `Limit the number of records to be returned in the results.`,
            },
            "_sort": {
                description: `The name of an attribute to sort the results. Prefix with "-" to sort descending.`,
            }
        };
        const modelParameters = [];
        return endpointMeta(route, 'find', urlParameters, extraParameters, modelParameters);
    }

    function findCountMeta(route, routeEntity) {
        const urlParameters = {};
        const extraParameters = {
            "_select": {
                description: `A comma delimited list of ${routeEntity} attributes to include in the results.`,
            },
            "_skip": {
                description: `The number of records to be skipped in the results.`,
            },
            "_limit": {
                description: `Limit the number of records to be returned in the results.`,
            },
            "_sort": {
                description: `The name of an attribute to sort the results. Prefix with "-" to sort descending.`,
            }
        };
        const modelParameters = [];
        return endpointMeta(route, 'find', urlParameters, extraParameters, modelParameters);
    }

    // Return a function to be evaluated *after* all plugins are loaded.
    function endpointMeta(route, operationId, urlParameters, extraParameters, ignoreParameters) {
        const entity = route.entity;
        const entityObj = route.entityObj;
        const mongoose = route.mongoose;
        const urlParams = urlParameters || {};
        const extraParams = extraParameters || {};
        const ignoreParams = (typeof ignoreParameters === 'string' ? [ignoreParameters] : ignoreParameters) || [];

        return function () {
            debug(`OpenApi ${this.method} endpoint meta for ${entity}.`);
            const meta = {
                summary: entityObj.summary || `Fetch ${entity}s.`,
                operationId: `${operationId}-${entity}`,
                tags: [entity],
                parameters: [],
                schemas: {}
            }
            // Add any url parameters!
            Object.keys(urlParams).map((param) => {
                urlParams[param].name = param; // urlParams[param].name || param;
                urlParams[param].in = 'path'; // urlParams[param].in || 'path';
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
                    meta.schemas[entity] = schema;
                }
            } else {
                debug(`OpenApi did not find a mongoose model for '${route.modelPrefix + route.modelName}'.`);
            }
            return meta;
        };
    }

    return {
        instanceTypes,
        insertMeta,
        findBinaryMeta,
        findByIdMeta,
        findMeta,
        findCountMeta,
        endpointMeta
    };
}