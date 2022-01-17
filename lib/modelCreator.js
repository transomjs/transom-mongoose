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
	const customTypeKey = options.typeKey || '$type';
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
		const entities = options.entities;
		const collations = options.collations || {};

		assert(entity.code, 'Entity must include a code attribute.');
		assert(entity.name, 'Entity must include a name attribute.');

		let attributes = [];
		Object.keys(entity.attributes).forEach(function (key) {
			const attr = {};
			if (typeof entity.attributes[key] === 'string') {
				attr.type = entity.attributes[key];
			} else {
				Object.assign(attr, entity.attributes[key]);
			}
			const attribute = {
				code: key
			};
			attribute.type = attr.type || 'string'; // default 'string'
			attribute.name = attr.name || modelUtils.toTitleCase(key);
			attribute.description = attr.description || `${attribute.name}(${attribute.type}) description not provided.`;
			attribute.order = Number.parseInt(attr.order) || 10000;
			attribute.textsearch = Number.parseInt(attr.textsearch) || 0;
			attribute.required = (attr.required === undefined ? false : !!attr.required); // default false
			attribute.csv = (attr.csv === undefined ? true : !!attr.csv); // default true
			attribute.default = attr.default;
			attribute.set = (typeof attr.set === 'function' ? attr.set : undefined);
			attribute.get = (typeof attr.get === 'function' ? attr.get : undefined);
			attribute.connect_entity = attr.ref || attr.connect_entity;
			attribute.min = attr.min;
			attribute.max = attr.max;
			attribute.uppercase = attr.uppercase;
			attribute.lowercase = attr.lowercase;
			attribute.trim = attr.trim;
			attribute.enum = attr.enum;
			attribute.match = attr.match;
			attribute.index = attr.index;
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

		const schemaObject = {};
		const schemaVirtuals = {};
		let selectedAttribs;

		if (qry._select) {
			selectedAttribs = qry._select.split(",");
		}

		const textIndexFields = {};
		const textIndexOptions = {
			name: entity.code + '_text_index',
			weights: {}
		};

		let order = 0;
		for (const attrib of attributes) {

			let includeAttribute = true;

			// If we have a limited set of Attributes, only add from the set.
			if (selectedAttribs) {
				includeAttribute = (selectedAttribs.indexOf(attrib.code) > -1);
			}

			if (includeAttribute) { //_id will be added at the end.
				let schemaType = attrib.type;

				const schemaTypeIsArray = (schemaType instanceof Array && schemaType.length === 1);
				if (schemaTypeIsArray) {
					schemaType = schemaType[0];
				}
				if (typeof schemaType === 'string') {
					schemaType = schemaType.toLowerCase();
				}
				if (schemaType === 'virtual') {
					// virtuals are added to the Schema after it's created.
					schemaVirtuals[attrib.code] = {};
					schemaVirtuals[attrib.code].get = attrib.get;
					schemaVirtuals[attrib.code].set = attrib.set;
				} else {
					schemaObject[attrib.code] = modelUtils.mapToSchemaType(schemaType, customTypeKey);
					schemaObject[attrib.code].__type = schemaType;
					if (schemaType === 'connector' || schemaType === 'objectid') {
						schemaObject[attrib.code].__connectEntity = attrib.connect_entity;
					}
					schemaObject[attrib.code].__description = attrib.description;
					schemaObject[attrib.code].name = attrib.name;
					schemaObject[attrib.code].csv = attrib.csv;
					schemaObject[attrib.code].order = order++; // Already been sorted.
					schemaObject[attrib.code].required = !!attrib.required;
					schemaObject[attrib.code].default = modelUtils.createDefault(attrib);

					if (attrib.index) {
						schemaObject[attrib.code].index = attrib.index;
					}

					if (typeof attrib.get === 'function') {
						schemaObject[attrib.code].get = attrib.get;
					}
					if (typeof attrib.set === 'function') {
						schemaObject[attrib.code].set = attrib.set;
					}

					switch ((schemaObject[attrib.code] || {}).__type) {
						case "binary":
							// Since we build explicit Select lists in the API handlers,
							// this is ok, and prevents unnecessary selection.
							schemaObject[attrib.code].select = false;
							schemaObject[attrib.code].required = false;
							break;
						case "string":
							schemaObject[attrib.code].uppercase = attrib.uppercase || false;
							schemaObject[attrib.code].lowercase = attrib.lowercase || false;
							schemaObject[attrib.code].trim = (attrib.trim === false ? false : true); // default true
							schemaObject[attrib.code].enum = attrib.enum;
							if (attrib.match) {
								schemaObject[attrib.code].match = attrib.match;
							}
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
						case "objectid":
							// If required, ref should be the name of a related entity.
							if (attrib.connect_entity && entities[attrib.connect_entity]) {
								schemaObject[attrib.code].ref = (modelPrefix + attrib.connect_entity);
							}
							break;
						case "date":
							if (attrib.min) {
								schemaObject[attrib.code].min = new Date(attrib.min);
							}
							if (attrib.max) {
								schemaObject[attrib.code].max = new Date(attrib.max);
							}
							break;
						case "boolean":
							default:
							// nothing else to do.
							break;
					}
					if (schemaTypeIsArray) {
						schemaObject[attrib.code] = [schemaObject[attrib.code]];
					}
				}
			}
		}

		// Add mandatory _id field at the end, overwriting any in the definition.
		schemaObject._id = {};
		schemaObject._id[customTypeKey] = Schema.Types.ObjectId;

		let timestamps;
		if (entity.audit !== false) {
			timestamps = {
				createdAt: (entity.audit ? entity.audit.createdAt : null) || 'createdDate',
				updatedAt: (entity.audit ? entity.audit.updatedAt : null) || 'updatedDate'
			};
		}

		// Include a default collation to be used with this Model.
		let schemaCollation;
		if (entity.collation)  {
			if ( typeof entity.collation === 'string') {
				if (!collations[entity.collation]) {
					throw new Error(`Entity ${entity.code} contains a non-existant named collation: ${entity.collation}`);
				}
				schemaCollation = collations[entity.collation];
				debug(`Creating ${entity.code} schema using named collation:`, schemaCollation);
			} else {
				schemaCollation = entity.collation;
				debug(`Creating ${entity.code} schema using a custom collation:`, schemaCollation);
			}
		} else {
			schemaCollation = { locale: 'en', caseLevel: true };
			debug(`Creating ${entity.code} schema using the default collation:`, schemaCollation);
		}

		const newSchema = new Schema(schemaObject, {
			id: entity.id,
			collection: entity.collection || entity.code,
			typeKey: customTypeKey,
			collation: schemaCollation,
			timestamps
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
			});

		// Create Schema virtual attributes.
		Object.keys(schemaVirtuals).map((key) => {
			const virtualAttribute = newSchema.virtual(key);
			// Add the getter & setter functions.
			const funcs = ['get', 'set'];
			funcs.map((f) => {
				const fnSpec = schemaVirtuals[key][f];
				if (typeof fnSpec === 'function') {
					virtualAttribute[f](fnSpec);
				}
			});
		});

		// Optionally turn off the auditable plugin
		if (entity.audit !== false) {
			const auditOpts = Object.assign({}, entity.audit);
			newSchema.plugin(auditablePlugin({
				entity
			}), auditOpts);
		}
		// Optionally turn off the toCSV plugin
		if (entity.csv !== false) {
			const csvOpts = Object.assign({}, entity.csv);
			newSchema.plugin(toCsvPlugin({
				entity
			}), csvOpts);
		}
		// Optionally turn off the ACL plugin
		if (entity.acl !== false) {
			const aclOpts = Object.assign({}, entity.acl);
			newSchema.plugin(aclPlugin({
				entity
			}), aclOpts);
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
		if (seed.length === 0) {
			return Promise.resolve();
		}
		// Set Id & audit fields before inserting
		seed.map(function (record) {
			record._id = record._id || Types.ObjectId().toHexString();
			record.modifiedBy = record.modifiedBy || 'seed-data';
		});

		return new Promise(function (resolve, reject) {
			model.estimatedDocumentCount({}, function (err, result) {
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

	function createEntities(options) {		
		const seedPromises = [];
		const entities = options.entities;
		const namedCollations = options.collations || {};
		const mongoose = server.registry.get('mongoose');
		
		// Create Mongoose models from the API definition.
		Object.keys(entities).forEach(function (key) {
			const entity = {
				code: key.toLowerCase()
			};
			entity.name = entities[key].name || modelUtils.toTitleCase(key);
			entity.acl = entities[key].acl;
			entity.audit = entities[key].audit;
			entity.collection = entities[key].collection;
			entity.csv = entities[key].csv;
			entity.id = (entity.id === undefined ? false : !!entity.id); // default false
			entity.attributes = entities[key].attributes;
			entity.collation = entities[key].collation;
			entity.actions = {};
			if (entities[key].actions) {
				entity.actions.pre = entities[key].actions.pre;
				entity.actions.post = entities[key].actions.post;
			}

			const schema = createSchema({
				server,
				entities,
				collations: namedCollations
			}, entity);

			// Mongoose models *must* go in as lower-case 'cause we 
			// get sanitized entity codes from _select in the url. 
			const modelName = modelPrefix + entity.code;

			delete mongoose.connection.models[modelName];
			const EntityModel = mongoose.model(modelName, schema);

			// Watch for errors from ensureIndex.
			EntityModel.on('index', err => {
				if (err) {
					console.error("Failed to create index:", err.message);
				} else {
					debug(`Indexes created on ${modelName}.`);
				}
			  });

			// If we have seed data in the API definition, load it.
			const seedData = entities[key].seed;
			if (seedData instanceof Array) {
				seedPromises.push(insertSeedData(EntityModel, seedData));
			}
		});

		Promise.all(seedPromises).then(() => {
			debug(`Seed data initialization completed on ${seedPromises.length} collections.`);
		}).catch((err) => {
			console.error("Failed to load Seed data:", err);
		});
	};

	return {
		wrapAction,
		createSchema,
		insertSeedData,
		createEntities
	};
};