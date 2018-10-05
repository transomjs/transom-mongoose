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
            case 'objectid':
            default:
                schema.type = 'string';
        }
        return schema;
    }

    // Return a function to be evaluated *after* all plugins are loaded.
    function endpointMeta(route, method, urlParameters) {
        const entityKey = route.entity;
        const entity = route.entityObj;
        const mongoose = route.mongoose;
        const urlParams = urlParameters || {};

        return function () {
            debug(`OpenApi ${method} endpoint meta for ${entityKey}.`);
            const meta = {
                summary: entity.summary || `Fetch ${entityKey}s!`,
                operationId: `find-${entityKey}s`,
                tags: [entityKey],
                parameters: [],
                schemas: {}
            }
            // Add any url parameters!
            Object.keys(urlParams).map((param) => {
                urlParams[param].name = param;
                urlParams[param].in = 'path';
                urlParams[param].required = true;
                meta.parameters.push(urlParams[param]);
            });
            const model = mongoose.models[route.modelPrefix + route.modelName];
            if (model) {
                const schema = {};
                schema.required = []; // array of mandatory field names
                schema.properties = {}; // attributes w/ openapi datatype schemas

                Object.keys(model.schema.paths).map((attribute) => {
                    if (openapiIgnore.includes(attribute) || openapiIgnore.includes(`${entityKey}.${attribute}`)) {
                        debug(`OpenApi skipping attribute ${entityKey}.${attribute}`);
                    } else {
                        if (model.schema.paths[attribute].isRequired) {
                            schema.required.push(attribute);
                        }
                        schema.properties[attribute] = instanceTypes(model.schema.paths[attribute].options.__type || model.schema.paths[attribute].instance);
                        const parameter = {
                            name: attribute,
                            in: 'query',
                            description: model.schema.paths[attribute].options.__description || `${attribute} description not provided`,
                            required: false,
                            schema: instanceTypes(model.schema.paths[attribute].options.__type || model.schema.paths[attribute].instance)
                        };
                        // const schema
                        meta.parameters.push(parameter);
                    }
                });
                meta.schemas[entityKey] = schema;
            } else {
                debug(`OpenApi did not find a mongoose model for '${route.modelPrefix + route.modelName}'.`);
            }
            return meta;
        };
    }

    return {
        instanceTypes,
        endpointMeta
    };
}