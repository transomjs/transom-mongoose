"use strict";
const debug = require('debug')('transom:mongoose:handler');
const ModelFunctions = require('./modelFunctions');
const createError = require('http-errors');

module.exports = function ModelHandler(options) {
	const IGNORED_ATTRIBUTES = 'Ignored-Attributes';
	const server = options.server;
	const mongoose = options.mongoose;
	const collations = options.collations;
	
	const modelFunctions = ModelFunctions({
		mongoose,
		collations
	});

	function getEntity(req, routeName) {
		const entity = {
			modelPrefix: '',
			modelName: ''
		};
		// req.locals.__entity is populated with middleware on the dynamic routes.
		if (req.locals.__entity) {
			entity.modelPrefix = req.locals.__entity.modelPrefix;
			entity.modelName = req.locals.__entity.modelName;
			if (req.locals.__entity.routes && req.locals.__entity.routes[routeName]) {
				entity.fx = req.locals.__entity.routes[routeName].fx;
				entity.responder = req.locals.__entity.routes[routeName].responder;
			}
		}
		// Adding the model to the Entity itself; throws MissingSchemaError if not found.
		entity.model = mongoose.model(entity.modelPrefix + entity.modelName);
		return entity;
	}

	function jsonResponder(server, entity, req, res, data) {
		if (data.skippedFields && data.skippedFields.length > 0) {
			res.setHeader(IGNORED_ATTRIBUTES, data.skippedFields.join());
		}
		res.json(data.item);
		return Promise.resolve();
	}

	function jsonArrayResponder(server, entity, req, res, data) {
		if (req.params._type === "csv" && typeof entity.model.csvHeaderRow === 'function') {
			debug('Converting handleFind results to CSV.');
			res.setHeader('content-disposition', `attachment; filename=${entity.modelName}-data.csv`);
			res.setHeader('content-type', 'text/csv');
			// Write the file starting with a header row.
			try {
				const csv = entity.model.csvHeaderRow(data.fields);
				res.write(csv.header);
				data.items.forEach((item) => {
					res.write(item.csvDataRow(csv.fields));
				});
			} catch (err) {
				debug('Converting handleFind results to CSV failed', err);
				res.write('There was an error writing to your csv file.\n');
				res.write(err);
			}
			res.end();
		} else {
			res.json({
				'data': data.items || []
			});
		}
		return Promise.resolve();
	}

	function binaryResponder(server, entity, req, res, data) {
		res.setHeader('Content-Type', data.mimetype);
		// Content-Length gets removed when using gzipResponse().
		res.setHeader('Content-Length', data.binaryData.length);

		const contentDisposition = req.params.attachment ? 'attachment' : undefined;
		if (contentDisposition) {
			res.setHeader('Content-Disposition', `${contentDisposition}; filename=${data.filename}`);
		}
		res.writeHead(200);
		res.write(data.binaryData);
		res.end();
		return Promise.resolve();
	}

	function handleFind(req, res, next) {
		const entity = getEntity(req, "find");
		debug(`HandleFind on ${entity.modelName}`);

		const modelFx = entity.fx || modelFunctions.modelFind;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonArrayResponder;
				return responder(server, entity, req, res, data);
			}).then(() => {
				next();
			}).catch(function (err) {
				debug(`HandleFind failed`, err);
				if (!err.statusCode) {
					err = createError(400, err, `Error executing ${entity.modelName} modelFind()`);
				}
				next(err);
			});
	};

	function handleFindById(req, res, next) {
		const entity = getEntity(req, "findById");
		debug(`HandleFindById on ${entity.modelName}`);
		const modelFx = entity.fx || modelFunctions.modelFindById;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonResponder;
				return responder(server, entity, req, res, {item: data});
			}).then(() => {
				next();
			}).catch(function (err) {
				debug('HandleFindById failed', err);
				if (!err.statusCode) {
					err = createError(400, err, `Error executing ${entity.modelName} modelFindById()`);
				}
				next(err);
			});
	};

	function handleFindBinary(req, res, next) {
		const entity = getEntity(req, "findBinary");
		debug(`HandleFindBinary on ${entity.modelName}`);
		const modelFx = entity.fx || modelFunctions.modelFindBinary;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || binaryResponder;
				return responder(server, entity, req, res, data);		
			}).then(() => {
				next();
			}).catch(function (err) {
				debug('HandleFindBinary failed', err);
				next(createError(400, err, `Error executing ${entity.modelName} modelFindBinary()`));
			});
	}

	function handleCount(req, res, next) {
		const entity = getEntity(req, "findCount");
		debug(`HandleCount on ${entity.modelName}`);
		const modelFx = entity.fx || modelFunctions.modelCount;
		modelFx(server, entity, req)
		.then((data) => {
			const responder = entity.responder || jsonResponder;
			return responder(server, entity, req, res, {item: data});
		}).then(() => {
			next();
		}).catch(function (err) {
				debug('HandleCount failed', err);
				next(createError(400, err, `Error executing ${entity.modelName} modelCount()`));
			});
	}

	function handleInsert(req, res, next) {
		const entity = getEntity(req, "insert");
		debug(`HandleInsert on ${entity.modelName}`);
		const modelFx = entity.fx || modelFunctions.modelInsert;
		modelFx(server, entity, req)
		.then((data) => {
			const responder = entity.responder || jsonResponder;
			return responder(server, entity, req, res, data);
		}).then(() => {
			next();
		}).catch(function (err) {
				debug('HandleInsert failed', err);
				next(createError(400, err, `Error executing ${entity.modelName} modelInsert()`));
			});
	}

	function handleDelete(req, res, next) {
		const entity = getEntity(req, "delete");
		debug(`HandleDelete on ${entity.modelName}`);
		const modelFx = entity.fx || modelFunctions.modelDelete;
		modelFx.modelDelete(entity, req)
		.then((data) => {
			const responder = entity.responder || jsonResponder;
			return responder(server, entity, req, res, {item: data});
		}).then(() => {
			next();
		}).catch(function (err) {
				debug('HandleDelete failed', err);
				next(createError(400, err, `Error executing ${entity.modelName} modelDelete()`));
			});
	}

	function handleDeleteById(req, res, next) {
		const entity = getEntity(req, "deleteById");
		debug(`HandleDeleteById on ${entity.modelName}`);
		const modelFx = entity.fx || modelFunctions.modelDeleteById;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonResponder;
				return responder(server, entity, req, res, {item: data});
			}).then(() => {
				next();
			}).catch(function (err) {
				debug('HandleDeleteById failed', err);
				next(createError(400, err, `Error executing ${entity.modelName} modelDeleteById()`));
			});
	}

	function handleDeleteBatch(req, res, next) {
		const entity = getEntity(req, "deleteBatch");
		debug(`HandleDeleteBatch on ${entity.modelName}`);
		const modelFx = entity.fx || modelFunctions.handleDeleteBatch;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonResponder;
				return responder(server, entity, req, res, {item: data});
			}).then(() => {
				next();
			}).catch(function (err) {
				debug('HandleDeleteBatch failed', err);
				next(createError(400, err, `Error executing ${entity.modelName} modelDeleteBatch()`));
			});
	}

	function handleUpdateById(req, res, next) {
		const entity = getEntity(req, "updateById");
		debug(`HandleUpdateById on ${entity.modelName}`);
		const modelFx = entity.fx || modelFunctions.modelUpdateById;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonResponder;
				return responder(server, entity, req, res, data);
			}).then(() => {
				next();
			}).catch(function (err) {
				debug('HandleUpdateById failed', err);
				next(createError(400, err, `Error executing ${entity.modelName} modelUpdateById()`));
			});
	}

	return {
		getEntity,
		jsonResponder,
		jsonArrayResponder,
		binaryResponder,
		handleFind,
		handleFindById,
		handleFindBinary,
		handleCount,
		handleInsert,
		handleDelete,
		handleDeleteById,
		handleDeleteBatch,
		handleUpdateById
	};
};