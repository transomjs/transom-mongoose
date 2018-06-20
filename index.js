'use strict';
const debug = require('debug')('transom:mongoose');
const mongoose = require('mongoose');
const ModelCreator = require('./lib/modelCreator');
const ModelHandler = require('./lib/modelHandler');
const MongooseConnect = require('./lib/mongooseConnect');
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

			debug("Adding mongoose to the registry as %s", regKey)
			server.registry.set(regKey, mongoose);

			// Pass optional model plugins to the ModelCreator
			options.plugins = options.plugins || {};

			function setupModelCreator() {
				const modelCreator = new ModelCreator({
					server,
					modelPrefix,
					auditable: options.auditable || transomAuditablePlugin,
					acl: options.acl || transomAclPlugin,
					toCsv: options.csv || transomToCsvPlugin,
					plugins: options.plugins // User plugins to apply to each Model.
				});
				const dbMongoose = server.registry.get('transom-config.definition.mongoose', {});

				// TODO: deprecate the fallback, use dbMongoose.entities only.
				const entities = dbMongoose.entities || dbMongoose;
				modelCreator.createEntities(entities);
			}

			function setupModelHandler() {
				const modelHandler = ModelHandler({
					mongoose
				});

				const preMiddleware = options.preMiddleware || [];
				const postMiddleware = options.postMiddleware || [];

				const uriPrefix = server.registry.get('transom-config.definition.uri.prefix');

				// Sample: An array of custom Models with routes.
				// routes = [{
				// 	entity: 'foo-group', // becomes the uri: /db/foo-group
				// 	modelName: 'Group', // this is the mongoose model name
				// 	modelPrefix: 'transom'
				// }, {
				// 	entity: 'address',
				// 	modelName: 'dynamic-address',
				// 	modelPrefix: '',
				// 	insert: true,
				// 	find: true,
				// 	findCount: true,
				// 	findBinary: false,
				// 	findById: true,
				// 	updateById: true,
				// 	delete: true,
				// 	deleteById: true,
				// 	deleteBatch: true
				// }];

				const dbMongoose = server.registry.get('transom-config.definition.mongoose', {});
				const allRoutes = [];

				// Pre-built models, from the module init, or API definition
				const models = Object.assign({}, options.models, dbMongoose.models);
				Object.keys(models).map(function (key) {
					// TODO: Remove the check for :__entity
					if (key !== ':__entity') {
						const route = {
							entity: key,
							modelName: models[key].modelName,
							versions: models[key].versions || ['1.0.0']
						};
						route.routes = models[key].routes ? models[key].routes : { delete: false };
						allRoutes.push(route);
					}
				});

				// Generated models
				// TODO: deprecate the fallback, use dbMongoose.entities only.
				const entities = dbMongoose.entities || dbMongoose;
				Object.keys(entities).map(function (key) {
					const route = {
						entity: key,
						modelName: `${modelPrefix}${key}`,
						versions: entities[key].versions || ['1.0.0']
					};
					route.routes = Object.assign({ delete: false }, entities[key].routes);
					allRoutes.push(route);
				});

				// Map the known routes to endpoints.
				allRoutes.map(function (route) {
					// Copy the preMiddleware and append one that adds route details to req.locals.__entity
					const pre = preMiddleware.slice(0);
					pre.push(function (req, res, next) {
						const r = Object.assign({}, route); // Don't modify route as it stays in scope
						req.locals.__entity = r;
						next();
					});

					// 
					const routeEntity = route.entity;

					// CREATE
					if (route.routes.insert !== false) {
						server.post({path: `${uriPrefix}/db/${routeEntity}`, versions: route.versions}, pre, modelHandler.handleInsert, postMiddleware); //insert single
					}

					// READ
					if (route.routes.find !== false) {
						server.get({path: `${uriPrefix}/db/${routeEntity}`, versions: route.versions}, pre, modelHandler.handleFind, postMiddleware); // find query
					}
					if (route.routes.findCount !== false) {
						server.get({path: `${uriPrefix}/db/${routeEntity}/count`, versions: route.versions},  pre, modelHandler.handleCount, postMiddleware); // count query
					}
					if (route.routes.findBinary !== false) {
						server.get({path: `${uriPrefix}/db/${routeEntity}/:__id/:__attribute/:__filename`, versions: route.versions},  pre, modelHandler.handleFindBinary, postMiddleware); //find single with stored binary
					}
					if (route.routes.findById !== false) {
						server.get({path: `${uriPrefix}/db/${routeEntity}/:__id`, versions: route.versions},  pre, modelHandler.handleFindById, postMiddleware); //find single
					}

					// UPDATE
					if (route.routes.updateById !== false) {
						server.put({path: `${uriPrefix}/db/${routeEntity}/:__id`, versions: route.versions},  pre, modelHandler.handleUpdateById, postMiddleware); //update single
					}

					// DELETE
					if (route.routes.delete !== false) {
						server.del({path: `${uriPrefix}/db/${routeEntity}`, versions: route.versions},  pre, modelHandler.handleDelete, postMiddleware); //delete query - Yikes!
					}
					if (route.routes.deleteBatch !== false) {
						server.del({path: `${uriPrefix}/db/${routeEntity}/batch`, versions: route.versions},  pre, modelHandler.handleDeleteBatch, postMiddleware); //delete batch
					}
					if (route.routes.deleteById !== false) {
						server.del({path: `${uriPrefix}/db/${routeEntity}/:__id`, versions: route.versions},  pre, modelHandler.handleDeleteById, postMiddleware); //delete single
					}
				});
			};

			const mongooseSetupPromises = [];

			if (options.connect !== false) {
				mongooseSetupPromises.push(
					MongooseConnect({
						mongoose,
						uri: options.mongodbUri,
						connectOptions: connect
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
		},
		this.preStart = function (server, options) {
			const dbMongoose = server.registry.get('transom-config.definition.mongoose', {});
			const sysAdminGroup = 'sysadmin';

			//lastly, make sure that the groups referenced in the acl properties are seeded in the security plugin
			if (server.registry.has('transomLocalUserClient')) {
				const localUserClient = server.registry.get('transomLocalUserClient')
				// collect the distinct groups first
				// Create Mongoose models from the API definition.
				const groups = [sysAdminGroup];
				Object.keys(dbMongoose).forEach(function (key) {
					const acl = dbMongoose[key].acl || {};
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
