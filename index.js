'use strict';
const debug = require('debug')('transom:mongoose');
const mongoose = require('mongoose');
const ModelCreator = require('./lib/modelCreator');
const ModelHandler = require('./lib/modelHandler');
const MongooseConnect = require('./lib/mongooseConnect');
const OpenApiMeta = require('./lib/openApiMeta');

// Default plugins
const transomAuditablePlugin = require('./lib/plugins/auditablePlugin');
const transomAclPlugin = require('./lib/plugins/aclPlugin');
const transomToCsvPlugin = require('./lib/plugins/toCsvPlugin');

function TransomMongoose() {

	this.initialize = function (server, options) {

			// Use native Promises within Mongoose.
			mongoose.Promise = Promise;
			const regKey = options.mongooseKey || 'mongoose';
			const modelPrefix = options.modelPrefix || 'dynamic-';
			const openapiIgnore = options.openapiIgnore || ['__v', '__t', '_acl'];
			const openapiSecurity = options.openapiSecurity || {};
			const customTypeKey = options.typeKey || '$type';

			debug("Adding mongoose to the registry as %s", regKey);
			server.registry.set(regKey, mongoose);

			// Pass optional model plugins to the ModelCreator
			options.plugins = options.plugins || {};

			function setupModelCreator() {
				const modelCreator = new ModelCreator({
					server,
					modelPrefix,
					typeKey: customTypeKey,
					auditable: options.auditable || transomAuditablePlugin,
					acl: options.acl || transomAclPlugin,
					toCsv: options.csv || transomToCsvPlugin,
					plugins: options.plugins // User plugins to apply to each Model.
				});
				const dbMongoose = server.registry.get('transom-config.definition.mongoose', {});
				const entities = dbMongoose.entities || {};
				modelCreator.createEntities(entities);
			}

			function setupModelHandler() {
				const modelHandler = ModelHandler({
					mongoose,
					typeKey: customTypeKey
				});

				const preMiddleware = options.preMiddleware || [];
				const postMiddleware = options.postMiddleware || [];

				const uriPrefix = server.registry.get('transom-config.definition.uri.prefix');
				const openApiMeta = new OpenApiMeta(server, {
					ignore: openapiIgnore,
					security: openapiSecurity
				});
				const dbMongoose = server.registry.get('transom-config.definition.mongoose', {});
				const allRoutes = [];

				// Pre-built models, from the module init, or API definition
				const models = Object.assign({}, options.models, dbMongoose.models);
				Object.keys(models).map(function (key) {
					const route = {
						entity: key.toLowerCase(),
						entityObj: models[key],
						modelPrefix: '', // No prefix on provided models!
						modelName: models[key].modelName,
						mongoose,
						versions: models[key].versions || null // If null, doesn't require the 'Accept-Version' header.
					};
					route.routes = models[key].routes ? models[key].routes : { delete: false };
					// route.meta = openApiMeta.endpointMeta(route);
					allRoutes.push(route);
				});

				// Generated models
				const entities = dbMongoose.entities || {};
				Object.keys(entities).map(function (key) {
					const route = {
						entity: key.toLowerCase(),
						entityObj: entities[key],
						modelPrefix,
						modelName: key.toLowerCase(),
						mongoose,
						versions: entities[key].versions || null // If null, doesn't require the 'Accept-Version' header.
					};
					route.routes = Object.assign({ delete: false }, entities[key].routes);
					// route.meta = openApiMeta.endpointMeta(route);
					allRoutes.push(route);
				});

				// Map the known routes to endpoints.
				allRoutes.map(function (route) {
					// Copy the preMiddleware and append one that adds route details to req.locals.__entity
					// This tells the modelHandler which mongoose models to use!
					const pre = preMiddleware.slice(0);
					pre.push(function (req, res, next) {
						const r = Object.assign({}, route); // Don't modify route as it stays in scope
						req.locals.__entity = r;
						next();
					});

					// 
					const routeEntity = route.entity;

					// *** CREATE *********************************************
					if (route.routes.insert !== false) {
						server.post({path: `${uriPrefix}/db/${routeEntity}`, 
									meta: openApiMeta.insertMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleInsert, postMiddleware); //insert single
					}

					// *** READ ***********************************************
					if (route.routes.find !== false) {
						// find query
						server.get({path: `${uriPrefix}/db/${routeEntity}`, 
									meta: openApiMeta.findMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleFind, postMiddleware);
					}
					if (route.routes.findCount !== false) {
						// count query
						server.get({path: `${uriPrefix}/db/${routeEntity}/count`, 
									meta: openApiMeta.findCountMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleCount, postMiddleware); 
					}
					if (route.routes.findBinary !== false) {
						// find single with stored binary
						server.get({path: `${uriPrefix}/db/${routeEntity}/:__id/:__attribute/:__filename`, 
									meta: openApiMeta.findBinaryMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleFindBinary, postMiddleware); 
					}
					if (route.routes.findById !== false) {
						// find single
						server.get({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
									meta: openApiMeta.findByIdMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleFindById, postMiddleware); 
					}

					// *** UPDATE  ********************************************
					if (route.routes.updateById !== false) {
						// update single
						server.put({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
									meta: openApiMeta.updateByIdMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleUpdateById, postMiddleware);
					}

					// *** DELETE  ********************************************
					if (route.routes.delete !== false) {
						 // delete query - This route is disabled by default ans must be enabled as needed. 
						 // 				It's too easy to blow away the whole collection!
						server.del({path: `${uriPrefix}/db/${routeEntity}`, 
									meta: openApiMeta.deleteMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleDelete, postMiddleware);
					}
					if (route.routes.deleteBatch !== false) {
						 // delete batch
						server.del({path: `${uriPrefix}/db/${routeEntity}/batch`, 
									meta: openApiMeta.deleteBatchMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleDeleteBatch, postMiddleware);
					}
					if (route.routes.deleteById !== false) {
						// delete single
						server.del({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
									meta: openApiMeta.deleteByIdMeta(route, routeEntity), 
									versions: route.versions}, pre, modelHandler.handleDeleteById, postMiddleware);
					}
				});
			};

			const mongooseSetupPromises = [];

			if (options.connect !== false) {
				mongooseSetupPromises.push(
					MongooseConnect({
						mongoose,
						uri: options.mongodbUri,
						connectOptions: options.connect
					})
				);
			}
			mongooseSetupPromises.push(
				setupModelCreator()
			);
			mongooseSetupPromises.push(
				setupModelHandler()
			);
			return Promise.all(mongooseSetupPromises);
		}

		this.preStart = function (server, options) {
			const dbMongoose = server.registry.get('transom-config.definition.mongoose', {});
			const sysAdminGroup = 'sysadmin';

			//lastly, make sure that the groups referenced in the acl properties are seeded in the security plugin
			if (server.registry.has('transomLocalUserClient')) {
				const localUserClient = server.registry.get('transomLocalUserClient')
				// collect the distinct groups first
				// Create Mongoose models from the API definition.
				const groups = [sysAdminGroup];
				// Get Group names from the db entities.
				const entites = dbMongoose.entities || {};
				Object.keys(entites).forEach(function (key) {
					const acl = entites[key].acl || {};
					if (acl.create) {
						if (typeof acl.create === 'string') {
							acl.create = [acl.create];
						}
						groups.push(...acl.create);
					}
					if (acl.default && acl.default.groups) {
						groups.push(...Object.keys(acl.default.groups));
					}
				});
				// Build a list of distinct group codes.
				const distinctGroups = {};
				groups.map(function (group) {
					group = group.toLowerCase().trim();
					distinctGroups[group] = true;
				});

				localUserClient.setGroups(server, distinctGroups);
			}
		}
}

module.exports = new TransomMongoose();
