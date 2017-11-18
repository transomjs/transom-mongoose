const http = require('http');
const https = require('https');
const assert = require('assert');
const {
	Schema
} = require('mongoose');
const modelUtils = require('./modelUtils');
const auditablePlugin = require('./plugins/auditablePlugin');
const aclPlugin = require('./plugins/aclPlugin');
const toCsvPlugin = require('./plugins/toCsvPlugin');

module.exports = function ModelCreator() {

	function createSchema(options, entity) {
		const server = options.server;
		const dbMongoose = server.registry.get('transom-options.api_definition.db_mongoose', {});
		
		assert(entity.code, 'Entity must include a code attribute.');
		assert(entity.name, 'Entity must include a name attribute.');

		let attributes = [];
		Object.keys(entity.attributes).forEach(function (key) {
			const attribute = {
				code: key
			};
			if (typeof entity.attributes[key] === 'string') {
				attribute.name = modelUtils.toTitleCase(entity.attributes[key]);
			} else {
				attribute.name = entity.attributes[key].name || modelUtils.toTitleCase(key);
			}
			attribute.order = parseInt(entity.attributes[key].order) || 10000;
			attribute.textsearch = parseInt(entity.attributes[key].textsearch) || 0;
			attribute.required = (entity.attributes[key].required === undefined ? false : !!entity.attributes[key].required); // default false
			attribute.type = entity.attributes[key].type;
			attribute.csv = (entity.attributes[key].csv === undefined ? true : !!entity.attributes[key].csv); // default true
			attribute.default = entity.attributes[key].default;
			attribute.set = (typeof entity.attributes[key].set === 'function' ? entity.attributes[key].set : undefined);
			attribute.get = (typeof entity.attributes[key].get === 'function' ? entity.attributes[key].get : undefined);
			attribute.connect_entity = entity.attributes[key].connect_entity;
			attribute.min = Number.isNaN(entity.attributes[key].min) ? undefined : Number(entity.attributes[key].min);
			attribute.max = Number.isNaN(entity.attributes[key].max) ? undefined : Number(entity.attributes[key].max);
			attributes.push(attribute);
		});

		// TODO: create Queries in the API definition to be handled similarly.
		var isQuery = false;

		// Apply API defined query info as a base!
		var qry = {};
		if (isQuery) {
			qry = modelUtils.parseUserQueryString(entity.queryString);
		}

		// Sort the entity attributes in the defined order, so the schema
		// and the csv export maps all get created in the correct order.
		attributes.sort(function (a1, a2) {
			// Sort by .order, then by code with UTF8 safe
			return (a1.order - a2.order) || a1.code.localeCompare(a2.code);
		});

		var schemaObject = {};
		var selectedAttribs;

		if (qry._select) {
			selectedAttribs = qry._select.split(",");
		}

		var textIndexFields = {};
		var textIndexOptions = {
			name: entity.code + '_text_index',
			weights: {}
		};

		let order = 0;
		for (const attrib of attributes) {

			var includeAttribute = true;

			// If we have a limited set of Attributes, only add from the set.
			if (selectedAttribs) {
				includeAttribute = (selectedAttribs.indexOf(attrib.code) > -1);
			}

			if (includeAttribute) { //_id will be added at the end.
				schemaObject[attrib.code] = modelUtils.mapToSchemaType(attrib);

				schemaObject[attrib.code].name = attrib.name;
				schemaObject[attrib.code].csv = attrib.csv;
				schemaObject[attrib.code].order = order++; // Already been sorted.

				// console.log(entity.code + "." + attrib.code, "type: ", attrib.type);
				if (schemaObject[attrib.code].isBinary) {
					// Since we build explicit Select lists in the API handlers,
					// this is ok, and prevents unnecessary selection.
					schemaObject[attrib.code].select = false;
				} else {
					schemaObject[attrib.code].required = attrib.required; // force to boolean

					if (schemaObject[attrib.code].type === 'string') {
						schemaObject[attrib.code].minlength = attrib.min || 0;
						schemaObject[attrib.code].maxlength = attrib.max || 255;
					}
					if (schemaObject[attrib.code].type === 'number') {
						schemaObject[attrib.code].min = attrib.min;
						schemaObject[attrib.code].max = attrib.max;
					}

					// If required, ref should be the name of a related entity.
					if (attrib.connect_entity && dbMongoose[attrib.connect_entity]) {
						schemaObject[attrib.code].ref = attrib.connect_entity;
					}

					// Textsearch is Search Weight, allows fields to have more priority.
					if (attrib.textsearch > 0 && attrib.type === 'string') {
						textIndexFields[attrib.code] = 'text';
						textIndexOptions.weights[attrib.code] = attrib.textsearch;
					}

					schemaObject[attrib.code].default = modelUtils.createDefault(attrib);
				}
			}
		}

		// Add mandatory fields at the end, overwriting any in the definition.
		schemaObject['_id'] = {
			type: Schema.Types.ObjectId
		};

		var newSchema = new Schema(schemaObject, {
			id: entity.id,
			collection: entity.collection || entity.code,
			timestamps: {
				createdAt: 'created_date',
				updatedAt: 'updated_date'
			}
		});

		// Only if we have fields with textsearch > 0.
		if (Object.keys(textIndexFields).length) {
			newSchema.index(textIndexFields, textIndexOptions);
		}

		// Add Virtual for a url property on populated Binary fields.
		Object.keys(newSchema.paths).map(
			function (key) {
				const path = newSchema.paths[key];
				if (path.options.type && path.options.type.isBinary) {
					newSchema.virtual(`${key}.url`).get(function () {
						let result;
						if (this[key]) {
							const urlParts = ['', entity.code, this._id, key, this[key].filename];
							result = urlParts.join('/');
						}
						return result;
					});
				}
			}
		);

		newSchema.plugin(auditablePlugin);
		newSchema.plugin(toCsvPlugin);
		newSchema.plugin(aclPlugin.AclPlugin({
			entity
		}));


		// // http://mongoosejs.com/docs/guide.html#query-helpers
		// newSchema.query.aclCheck = function(aclOperation, req) {
		// 	if (!newSchema.statics.aclQuery) {
		// 		return this;
		// 	}
		// 	req.locals.acl = aclOperation;
		//
		// 	// if (aclOperation == "CREATE") {
		// 	//
		// 	// 	setAclDefaults.call(this, next, 'save');
		// 	// }
		//
		// 	const aclQuery = newSchema.statics.aclQuery(req);
		// 	return this.and(aclQuery);
		// };
		//
		// newSchema.methods.aclCreate = function(req) {
		// 	return newSchema.statics.setAclDefaults.call(this, req);
		// }
		//
		// newSchema.query.aclRead = function(req) {
		// 	return newSchema.query.aclCheck.call(this, "READ", req);
		// }
		// newSchema.query.aclWrite = function(req) {
		// 	return newSchema.query.aclCheck.call(this, "UPDATE", req);
		// }
		// newSchema.query.aclDelete = function(req) {
		// 	return newSchema.query.aclCheck.call(this, "DELETE", req);
		// }

		// Create an Array of columns for CSV, including fields added by plugins.
		// var modelColumns = [];
		// for (var path in newSchema.paths) {
		// 	const header = newSchema.paths[path].options.name ? newSchema.paths[path].options.name : modelUtils.toTitleCase(path);
		// 	const isBinary = !!(newSchema.paths[path].options.type && newSchema.paths[path].options.type.isBinary);
		// 	modelColumns.push({
		// 		path,
		// 		header,
		// 		isBinary
		// 	});
		// }

		// Create a static function to return the base info for Querying.
		newSchema.statics.userQuery = function () {
			return qry;
		};

		newSchema.methods.setConstants = modelUtils.constantsFunction();

		newSchema.__HelloMyNameIs = entity.code;

		newSchema.set('toJSON', {
			virtuals: true,
			transform: modelUtils.cleanJson(newSchema)
		});
		newSchema.set('toObject', {
			virtuals: true
		});

		const events = ['pre', 'post'];
		events.map(function (event) {
			if (entity.actions && entity.actions[event] && server.registry.has('mongooseActions')) {
				const wrapAction = server.registry.get('mongooseActions').createMongooseAction;
				const eventActions = entity.actions[event];
				Object.keys(eventActions).map(function (key) {
					const fnArray = (typeof eventActions[key] === 'function') ? [eventActions[key]] : eventActions[key];
					fnArray.map(function (eventFn) {
						newSchema[event](key, wrapAction(eventFn));
					});
				});
			}
		});

		// if (isQuery){
		//     // Force the discriminator on Queries!
		//     var discriminator = options.apiCode + "_" + ent.code;
		//     Model.schema.discriminatorMapping.value = discriminator;
		// }
		// console.log("Creating Model " + options.newModelName + "; " + Model.schema.discriminatorMapping.value);

		return newSchema;
	};

	function createEntities(options) {
		const server = options.server;
		const dbMongoose = server.registry.get('transom-options.api_definition.db_mongoose', {});
		// Create Mongoose models from the API definition.
		Object.keys(dbMongoose).forEach(function (key) {
			const entity = {
				code: key
			};
			entity.name = dbMongoose[key].name || modelUtils.toTitleCase(key);
			entity.acl = dbMongoose[key].acl;
			entity.id = (entity.id === undefined ? false : !!entity.id); // default false
			entity.attributes = dbMongoose[key].attributes;
			entity.actions = {};
			if (dbMongoose[key].actions) {
				entity.actions.pre = dbMongoose[key].actions.pre;
				entity.actions.post = dbMongoose[key].actions.post;
			}

			const schema = createSchema({
				server,
				dbMongoose
			}, entity);

			// Mongoose models *must* go in as lower-case 'cause we 
			// get sanitized entity codes from _select in the url. 
			const mongoose = server.registry.get('mongoose');
			delete mongoose.connection.models[entity.code];
			mongoose.model(entity.code, schema);
		});
	};

	return {
		createSchema,
		createEntities
	};
}();