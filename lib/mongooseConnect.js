"use strict";
const debug = require('debug')('transom:mongoose');

module.exports = function MongooseConnect(options) {
	const dbURI = options.uri;
	const mongoose = options.mongoose;
	const dbjs = {
		waitingForTimeout: null,
		retrySeconds: options.retrySeconds || 15
	};

	const mongooseConnectOptions = options.connectOptions || {
		poolSize: 10,
		// useMongoClient: true,
		useCreateIndex: true,
		useNewUrlParser: true
	};

	dbjs.dbConnect = function(retry) {
		clearTimeout(dbjs.waitingForTimeout);

		return mongoose.connect(dbURI, mongooseConnectOptions)
			.then(function(db) {
				debug('Connected to mongo - ' + new Date().toUTCString());
			})
			.catch(function(err) {
				debug('Failed to connect to mongo - ' + new Date().toUTCString());
				if (retry) {
					debug(`Retrying mongo connect in ${dbjs.retrySeconds} seconds.`);
					dbjs.waitingForTimeout = setTimeout(function() {
						dbjs.dbConnect(retry);
					}, (dbjs.retrySeconds * 1000));
				}
			});
	};

	// CONNECTION EVENTS
	// When successfully connected
	mongoose.connection.on('connected', function() {
		debug('Mongoose default connection connected');
	});

	// If the connection throws an error
	mongoose.connection.on('error', function(err) {
		console.error('Mongoose default connection error:', err.message);
	});

	// When the connection is disconnected
	mongoose.connection.on('disconnected', function() {
		debug('Mongoose default connection disconnected');
		dbjs.waitingForTimeout = setTimeout(function() {
				dbjs.dbConnect(false);
			},
			dbjs.retrySeconds * 1000);
	});

	// If the Node process ends, close the Mongoose connection.
	process.on('SIGINT', function() {
		mongoose.connection.close(function() {
			debug('Mongoose default connection disconnected through API termination');
			process.exit(0);
		});
	});

	return dbjs.dbConnect(true);
}
