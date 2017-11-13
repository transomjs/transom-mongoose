'use strict';

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

function MongooseActions(server) {
	
	/**
	 * Return a function that can be added to a Mongoose model as an
	 * asynchronous post-(init, validate, save or remove) action.
	 *
	 * Injects the server instance to allow access to shared services.
	 * Requires calling next() on success
	 * or next(new Error('Very bad things')) on failure.
	 *
	 * @param  {[type]} postAction [description]
	 * @return {[type]}            [description]
	 */
	this.createMongooseAction = function (genericAction) {
		// Future, use rest & spread operators.
		return function (a, b, c, d) {
			// Use call() to make sure we have the correct 'this'.
			genericAction.call(this, server, a, b, c, d);
		}
	}
}

function TransomMongoose() {

	this.initialize = function(server, options) {
		// Use native Promises within Mongoose.
		mongoose.Promise = Promise;
		server.registry.set(options.registryKey || 'mongoose', mongoose);

		const mongooseActions = new MongooseActions(server);
		server.registry.set('MongooseActions', mongooseActions);

		MongooseConnect({mongoose, uri: options.mongodb_uri});
		ModelCreator.createEntities({server});

		const modelHandler = ModelHandler({mongoose});
		const postMiddleware = options.postMiddleware || [];
		const preMiddleware = [function (req, res, next) {
			// Delayed resolution of the middleware.
			if (server.registry.has('isLoggedIn')) {
				server.registry.get('isLoggedIn')(req, res, next);
			} else {
				next();
			}
		}, ...(options.preMiddleware || [])];

		// CREATE
		server.post ('/v1/:__api_code/:__version/db/:__entity', preMiddleware, modelHandler.handleInsert, postMiddleware); //insert single

		// READ
		server.get ('/v1/:__api_code/:__version/db/:__entity', preMiddleware, modelHandler.handleFind, postMiddleware); // find query
		server.get ('/v1/:__api_code/:__version/db/:__entity/count', preMiddleware, modelHandler.handleCount, postMiddleware); // count query
		server.get ('/v1/:__api_code/:__version/db/:__entity/:__id/:__attribute/:__filename', preMiddleware, modelHandler.handleFindBinary, postMiddleware); //find single with stored binary
		server.get ('/v1/:__api_code/:__version/db/:__entity/:__id', preMiddleware, modelHandler.handleFindById, postMiddleware); //find single

		// UPDATE
		server.put ('/v1/:__api_code/:__version/db/:__entity/:__id', preMiddleware, modelHandler.handleUpdateById, postMiddleware); //update single

		// DELETE
		// server.del ('/v1/:__api_code/:__version/db/:__entity', preMiddleware, modelHandler.handleDelete, postMiddleware); //delete query - Yikes!
		server.del ('/v1/:__api_code/:__version/db/:__entity/batch', preMiddleware, modelHandler.handleDeleteBatch, postMiddleware); //delete batch
		server.del ('/v1/:__api_code/:__version/db/:__entity/:__id', preMiddleware, modelHandler.handleDeleteById, postMiddleware); //delete single
	}
}

module.exports = new TransomMongoose();