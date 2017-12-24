'use strict';
const debug = require('debug')('transom:mongoose');
const mongoose = require('mongoose');
const ModelCreator = require('./lib/modelCreator');
const ModelHandler = require('./lib/modelHandler');
const MongooseConnect = require('./lib/mongooseConnect');

/*
EXAMPLES:

[GET] http://localhost:8000/v1/abc123/1/db/person
[GET] http://localhost:8000/v1/abc123/1/db/address
[GET] http://localhost:8000/v1/abc123/1/db/address/593b4a13b5ed6f28c803023a
[GET] http://localhost:8000/v1/abc123/1/db/address?_connect=person.shipping
[GET] http://localhost:8000/v1/abc123/1/db/address?_connect=person.shipping,person.billing
[GET] http://localhost:8000/v1/abc123/1/db/address?_connect=person.shipping,person.billing&_select=person_shipping.firstname
[GET] http://localhost:8000/v1/abc123/1/db/address?_connect=person.shipping,person.billing&_select=person_shipping.firstname,city

[DELETE] http://localhost:8000/v1/abc123/1/db/address/593b4a13b5ed6f28c803023a
[POST] http://localhost:8000/v1/abc123/1/db/address/593b4a13b5ed6f28c803023a (is an Insert)
[PUT] http://localhost:8000/v1/abc123/1/db/address/593b4a13b5ed6f28c803023a (is an Update)
*/

function TransomMongoose() {

	this.initialize = function (server, options) {
		// Use native Promises within Mongoose.
		mongoose.Promise = Promise;
		const regKey = options.mongooseKey || 'mongoose';
		debug("Adding mongoose to the registry as %s", regKey)
		server.registry.set(regKey, mongoose);

		MongooseConnect({
			mongoose,
			uri: options.mongodbUri
		});

		const modelPrefix = options.modelPrefix || 'dynamic-';

		const modelCreator = new ModelCreator({
			server,
			modelPrefix
		});
		modelCreator.createEntities();

		const modelHandler = ModelHandler({
			mongoose
		});

		const postMiddleware = options.postMiddleware || [];
		const preMiddleware = [function (req, res, next) {
			// Delayed resolution of the middleware.
			if (server.registry.has('isLoggedIn')) {
				server.registry.get('isLoggedIn')(req, res, next);
			} else {
				next();
			}
		}, ...(options.preMiddleware || [])];

		const uriPrefix = server.registry.get('transom-config.definition.uri.prefix');

		// future
		let customRoutes = options.overrides || [];

		// Sample: An array of custom Models with routes.
		// customRoutes = [{
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

		let found = false;
		for (var i = 0; i < customRoutes.length; i++) {
			if (customRoutes[i].entity == ':__entity') {
				found = true;
				break;
			}
		}
		if (!found) {
			// Add the Generic model handler *last*
			customRoutes.push({
				entity: ':__entity', // This will be used for pattern matched routes.
				modelPrefix: modelPrefix, // "dynamic-"
				delete: false
			});
		}

		customRoutes.map(function (route) {
			const pre = preMiddleware.slice(0);
			// If there's no modelName, it is assumed that [modelPrefix + entityName] is the model name in mongoose.
			pre.push(function (req, res, next) {
				route.modelName = route.modelName || req.params.__entity;
				req.locals.__entity = route;
				next();
			});

			// CREATE
			if (route.insert !== false) {
				server.post(`${uriPrefix}/db/${route.entity}`, pre, modelHandler.handleInsert, postMiddleware); //insert single
			}

			// READ
			if (route.find !== false) {
				server.get(`${uriPrefix}/db/${route.entity}`, pre, modelHandler.handleFind, postMiddleware); // find query
			}
			if (route.findCount !== false) {
				server.get(`${uriPrefix}/db/${route.entity}/count`, pre, modelHandler.handleCount, postMiddleware); // count query
			}
			if (route.findBinary !== false) {
				server.get(`${uriPrefix}/db/${route.entity}/:__id/:__attribute/:__filename`, pre, modelHandler.handleFindBinary, postMiddleware); //find single with stored binary
			}
			if (route.findById !== false) {
				server.get(`${uriPrefix}/db/${route.entity}/:__id`, pre, modelHandler.handleFindById, postMiddleware); //find single
			}

			// UPDATE
			if (route.updateById !== false) {
				server.put(`${uriPrefix}/db/${route.entity}/:__id`, pre, modelHandler.handleUpdateById, postMiddleware); //update single
			}

			// DELETE
			if (route.delete !== false) {
				server.del(`${uriPrefix}/db/${route.entity}`, pre, modelHandler.handleDelete, postMiddleware); //delete query - Yikes!
			}
			if (route.deleteBatch !== false) {
				server.del(`${uriPrefix}/db/${route.entity}/batch`, pre, modelHandler.handleDeleteBatch, postMiddleware); //delete batch
			}
			if (route.deleteById !== false) {
				server.del(`${uriPrefix}/db/${route.entity}/:__id`, pre, modelHandler.handleDeleteById, postMiddleware); //delete single
			}
		});
	}
}

module.exports = new TransomMongoose();