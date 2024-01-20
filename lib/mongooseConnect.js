"use strict";
const debug = require('debug')('transom:mongoose');

module.exports = function MongooseConnect(options) {
	const dbURI = options.uri;
	const mongoose = options.mongoose;
	const handleSigint = options.handleSigint === false ? false : true;
	const dbjs = {
		waitingForTimeout: null,
		retrySeconds: options.retrySeconds || 15
	};

	const mongooseConnectOptions = options.connectOptions || {
		minPoolSize: 5,
		maxPoolSize: 10,
	};

	dbjs.dbConnect = function(retry) {
		clearTimeout(dbjs.waitingForTimeout);
		debug('Calling mongoose.connect - ' + new Date().toUTCString());

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
	mongoose.connection.on('connected', () => {
		debug('Mongoose default connection is connected');
	});

	// If the connection throws an error
	mongoose.connection.on('error', (err) => {
		console.error('Mongoose default connection error:', err.message);
	});

	// When the connection is disconnected
	function disconnectedEvent() {
		debug('Mongoose default connection disconnected');
		dbjs.waitingForTimeout = setTimeout(() => {
			const isConnecting = this.states[this.readyState] === 'connecting' || this.states[this.readyState] === 'connected';
			if (!isConnecting) {
				dbjs.dbConnect(true);
			}
		},
		dbjs.retrySeconds * 1000);
	}	
	mongoose.connection.on('disconnected', options.events.disconnected || disconnectedEvent);

	// If the Node process ends, close the Mongoose connection.
	if (handleSigint) {
		process.on('SIGINT', () => {
			mongoose.connection.close().then(() => {
				debug('Mongoose default connection disconnected through API termination');
			}).catch((err) => {
				debug('Failed to close Mongoose default connection', err);
			}).finally(() => {
				process.exit(0);
			});
		});
	}

	return dbjs.dbConnect(true);
}
