"use strict";

module.exports = function MongooseConnect(options) {

	var dbURI = options.uri;
	var mongoose = options.mongoose;
	var dbjs = {
		waitingForTimeout: null,
		delaySeconds: 15
	};

	dbjs.dbConnect = function(retry) {
		var options = {
			poolSize: 10,
			useMongoClient: true
		};
		clearTimeout(dbjs.waitingForTimeout);

		mongoose.connect(dbURI, options)
			.then(function(db) {
				console.log('Connected to mongo - ' + new Date().toUTCString());
			})
			.catch(function(err) {
				console.error('Failed to connect to mongo - ' + new Date().toUTCString());
				console.error(err);
				if (retry) {
					console.error('Retrying in ' + dbjs.delaySeconds + ' seconds.');
					dbjs.waitingForTimeout = setTimeout(function() {
						dbjs.dbConnect(retry);
					}, (dbjs.delaySeconds * 1000));
				}
				return;
			});
	};
	dbjs.dbConnect(true);

	// CONNECTION EVENTS
	// When successfully connected
	mongoose.connection.on('connected', function() {
		console.log('Mongoose default connection open ');
	});

	// If the connection throws an error
	mongoose.connection.on('error', function(err) {
		console.log('Mongoose default connection error: ' + err);
	});

	// When the connection is disconnected
	mongoose.connection.on('disconnected', function() {
		console.log('Mongoose default connection disconnected');
		dbjs.waitingForTimeout = setTimeout(function() {
				dbjs.dbConnect(false);
			},
			dbjs.delaySeconds * 1000);
	});

	// If the Node process ends, close the Mongoose connection.
	process.on('SIGINT', function() {
		mongoose.connection.close(function() {
			console.log('Mongoose default connection disconnected through API termination');
			process.exit(0);
		});
	});
}
