"use strict";
const debug = require('debug')('transom:mongoose');

module.exports = function MongooseConnect(options) {

	var dbURI = options.uri;
	var mongoose = options.mongoose;
	var dbjs = {
		waitingForTimeout: null,
		delaySeconds: 15
	};

	var mongooseConnectOptions = {
		poolSize: 10,
		useMongoClient: true
	};

	dbjs.dbConnect = function(retry) {
		
		clearTimeout(dbjs.waitingForTimeout);

		mongoose.connect(dbURI, mongooseConnectOptions)
			.then(function(db) {
				debug('Connected to mongo - ' + new Date().toUTCString());
			})
			.catch(function(err) {
				debug('Failed to connect to mongo - ' + new Date().toUTCString(), err);
				if (retry) {
					debug(`Retrying mongo connect in ${dbjs.delaySeconds} seconds.`);
					dbjs.waitingForTimeout = setTimeout(function() {
						dbjs.dbConnect(retry);
					}, (dbjs.delaySeconds * 1000));
				}
				return;
			});
	};

	// CONNECTION EVENTS
	// When successfully connected
	mongoose.connection.on('connected', function() {
		debug('Mongoose default connection open');
	});

	// If the connection throws an error
	mongoose.connection.on('error', function(err) {
		debug('Mongoose default connection error', err);
	});

	// When the connection is disconnected
	mongoose.connection.on('disconnected', function() {
		debug('Mongoose default connection disconnected');
		dbjs.waitingForTimeout = setTimeout(function() {
				dbjs.dbConnect(false);
			},
			dbjs.delaySeconds * 1000);
	});

	// If the Node process ends, close the Mongoose connection.
	process.on('SIGINT', function() {
		mongoose.connection.close(function() {
			debug('Mongoose default connection disconnected through API termination');
			process.exit(0);
		});
	});

	return mongoose.connect(dbURI, mongooseConnectOptions);

}
