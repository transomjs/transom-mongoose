const http = require('http');
const https = require('https');
const assert = require('assert');
const {
	Schema,
	Types
} = require('mongoose');
const debug = require('debug')('transom:mongoose:creator');
const modelUtils = require('./modelUtils');

module.exports = function ModelCreator(options) {

	const server = options.server;
	const modelPrefix = options.modelPrefix;
	const auditablePlugin = options.auditable;
	const aclPlugin = options.acl;
	const toCsvPlugin = options.toCsv;
	const userPlugins = options.plugins || [];

	function wrapAction(genericAction) {
		// Future, use rest & spread operators.
		return function (a, b, c, d) {
			// Use call() to make sure we have the correct 'this'.
			genericAction.call(this, server, a, b, c, d);
		}
	}

	function createSchema(options, entity) {
		const server = options.server;
		const dbMongoose = server.registry.get('transom-config.definition.mongoose', {});

		assert(entity.code, 'Entity must include a code attribute.');
		assert(entity.name, 'Entity must include a name attribute.');

		let attributes = [];
		Object.keys(entity.attributes).forEach(function (key) {
			const attr = entity.attributes[key];
			const attribute = {
				code: key
			};
			attribute.type = (typeof attr === 'string' ? attr : attr.type) || 'string'; // default 'string'
			attribute.name = attr.name || modelUtils.toTitleCase(key);
			attribute.order = Number.parseInt(attr.order) || 10000;
			attribute.textsearch = Number.parseInt(attr.textsearch) || 0;
			attribute.required = (attr.required === undefined ? false : !!attr.required); // default false
			attribute.csv = (attr.csv === undefined ? true : !!attr.csv); // default true
			attribute.default = attr.default;
			attribute.set = (typeof attr.set === 'function' ? attr.set : undefined);
			attribute.get = (typeof attr.get === 'function' ? attr.get : undefined);
			attribute.connect_entity = attr.connect_entity;
			attribute.min = attr.min;
			attribute.max = attr.max;
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
				const schemaType = attrib.type.toLowerCase();
				schemaObject[attrib.code] = modelUtils.mapToSchemaType(schemaType);

				schemaObject[attrib.code].__type = schemaType;
				schemaObject[attrib.code].name = attrib.name;
				schemaObject[attrib.code].csv = attrib.csv;
				schemaObject[attrib.code].order = order++; // Already been sorted.

				schemaObject[attrib.code].required = !!attrib.required;
				schemaObject[attrib.code].default = modelUtils.createDefault(attrib);

				// console.log(entity.code, attrib.code, attrib.type, schemaObject[attrib.code].type);
				switch (schemaObject[attrib.code].__type) {
					case "binary":
						// Since we build explicit Select lists in the API handlers,
						// this is ok, and prevents unnecessary selection.
						schemaObject[attrib.code].select = false;
						schemaObject[attrib.code].required = false;
						break;
					case "string":
						schemaObject[attrib.code].minlength = Number.parseInt(attrib.min) || 0;
						schemaObject[attrib.code].maxlength = Number.parseInt(attrib.max) || 255;
						// Textsearch is Search Weight, allows fields to have more priority.
						if (Number.parseInt(attrib.textsearch)) {
							textIndexFields[attrib.code] = 'text';
							textIndexOptions.weights[attrib.code] = Number.parseInt(attrib.textsearch);
						}
						break;
					case "number":
						if (!Number.isNaN(Number.parseFloat(attrib.min))) {
							schemaObject[attrib.code].min = Number.parseFloat(attrib.min);
						}
						if (!Number.isNaN(Number.parseFloat(attrib.max))) {
							schemaObject[attrib.code].max = Number.parseFloat(attrib.max);
						}
						break;
					case "connector":
						// If required, ref should be the name of a related entity.
						if (attrib.connect_entity && dbMongoose[attrib.connect_entity]) {
							schemaObject[attrib.code].ref = (modelPrefix + attrib.connect_entity);
						}
						break;
					case "date":
					case "boolean":
					default:
						// nothing else to do.
						// console.log(attrib.type, schemaObject[attrib.code].type);
						break;
				}
			}
		}

		// Add mandatory _id field at the end, overwriting any in the definition.
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
				if (path.options.__type === 'binary') {
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

		// Optionally turn off the auditable plugin
		if (entity.audit !== false) {
			newSchema.plugin(auditablePlugin({
				entity
			}));
		}
		// Optionally turn off the toCSV plugin
		if (entity.csv !== false) {
			newSchema.plugin(toCsvPlugin({
				entity
			}));
		}
		// Optionally turn off the ACL plugin
		if (entity.acl !== false) {
			newSchema.plugin(aclPlugin({
				entity
			}));
		}
		// TODO: optional user plugins.
		// userPlugins.map(function(plugin) {
		// 	newSchema.plugin(plugin); // ?
		// });



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
		// 	const isBinary = (newSchema.paths[path].options.type && newSchema.paths[path].options.__type === 'binary');
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
			if (entity.actions && entity.actions[event]) {
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

		debug("Created schema", entity.name, Object.keys(newSchema.tree));
		return newSchema;
	};

	function insertSeedData(model, seed) {

		// Set Id & audit fields before inserting
		seed.map(function (record) {
			record._id = record._id || Types.ObjectId().toHexString();
			record.modifiedBy = record.modifiedBy || 'seed-data';
		});

		return new Promise(function (resolve, reject) {
			model.count({}, function (err, result) {
				if (err) {
					return reject(err);
				}
				if (result === 0) {
					model.create(seed, function (err, result) {
						if (err) {
							return reject(err);
						}
						debug(`Inserted ${result.length} seed records into ${model.collection.name}`);
						return resolve(result.length);
					});
				} else {
					debug(`Skipped seed data, ${model.collection.name} is not empty.`);
					return resolve(0);
				}
			});
		});
	}

	function createEntities() {
		const dbMongoose = server.registry.get('transom-config.definition.mongoose', {});

		const seedPromises = [];
		// Create Mongoose models from the API definition.
		Object.keys(dbMongoose).forEach(function (key) {
			const entity = {
				code: key.toLowerCase()
			};
			entity.name = dbMongoose[key].name || modelUtils.toTitleCase(key);
			entity.acl = dbMongoose[key].acl;
			entity.audit = dbMongoose[key].audit;
			entity.csv = dbMongoose[key].csv;
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
			const modelName = modelPrefix + entity.code;

			delete mongoose.connection.models[modelName];
			mongoose.model(modelName, schema);

			// If we have seed data in the API definition, load it.
			if (dbMongoose[key].seed) {
				const model = mongoose.model(modelName);
				const seedData = dbMongoose[key].seed;
				seedPromises.push(insertSeedData(model, seedData));
			}
		});

		Promise.all(seedPromises).then(function (result) {
			debug('Seed data initialization completed.');
		}).catch(function (err) {
			console.error("ERROR", err);
			debug("Seed data failed:", err);
		});
	};

	return {
		wrapAction,
		createSchema,
		insertSeedData,
		createEntities
	};
};