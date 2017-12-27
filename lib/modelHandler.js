"use strict";
const debug = require('debug')('transom:mongoose:handler');
const ModelFunctions = require('./modelFunctions');

module.exports = function ModelHandler(options) {

	const IGNORED_ATTRIBUTES = 'Ignored-Attributes';
	const mongoose = options.mongoose;

	const modelFunctions = ModelFunctions({
		mongoose
	});

	function getEntity(req) {
		let entity = {
			modelPrefix: '',
			modelName: req.params.__entity
		};
		if (req.locals.__entity) {
			entity.modelPrefix = req.locals.__entity.modelPrefix || '';
			entity.modelName = req.locals.__entity.modelName;
		}
		return entity;
	}

	function getModel(entity) {
		// throws MissingSchemaError if not found.
		return mongoose.model(entity.modelPrefix + entity.modelName);
	}

	function handleFind(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleFind on ${entity.modelName}`);
		modelFunctions.modelFind(getModel(entity), req)
			.then(function (data) {
				if (req.params._type === "csv") {
					debug('Converting handleFind results to CSV.');
					res.setHeader('content-disposition', `attachment; filename=${entity.modelName}-data.csv`);
					res.setHeader('content-type', 'text/csv');
					// Write the file starting with a header row.
					try {
						const csv = model.csvHeaderRow(data.fields);
						res.write(csv.header);
						data.items.map(function (item) {
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
						'data': data.items
					});
				}
				next();
			}).catch(function (err) {
				debug(`HandleFind failed`, err);
				next(err);
			});
	};

	function handleFindById(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleFindById on ${entity.modelName}`);
		modelFunctions.modelFindById(getModel(entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleFindById failed', err);
				next(err);
			});
	};

	function handleFindBinary(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleFindBinary on ${entity.modelName}`);
		modelFunctions.modelFindBinary(getModel(entity), req)
			.then(function (item) {
				res.setHeader('Content-Type', item.mimetype);
				// Content-Length gets removed when using gzipResponse().
				res.setHeader('Content-Length', item.binaryData.length);

				const contentDisposition = req.params.attachment ? 'attachment' : undefined;
				if (contentDisposition) {
					res.setHeader('Content-Disposition', `${contentDisposition}; filename=${item.filename}`);
				}
				res.writeHead(200);
				res.write(item.binaryData);
				res.end();
				next();
			}).catch(function (err) {
				debug('HandleFindBinary failed', err);
				next(err);
			});
	}

	function handleCount(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleCount on ${entity.modelName}`);
		modelFunctions.modelCount(getModel(entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleCount failed', err);
				next(err);
			});
	}

	function handleInsert(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleInsert on ${entity.modelName}`);
		modelFunctions.modelInsert(getModel(entity), req)
			.then(function (data) {
				if (data.skippedFields && data.skippedFields.length > 0) {
					res.setHeader(IGNORED_ATTRIBUTES, data.skippedFields.join());
				}
				res.json(data.item);
				next();
			}).catch(function (err) {
				debug('HandleInsert failed', err);
				next(err);
			});
	}

	function handleDelete(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleDelete on ${entity.modelName}`);
		modelFunctions.modelDelete(getModel(entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleDelete failed', err);
				next(err);
			});
	}

	function handleDeleteById(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleDeleteById on ${entity.modelName}`);
		modelFunctions.modelDeleteById(getModel(entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleDeleteById failed', err);
				next(err);
			});
	}

	function handleDeleteBatch(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleDeleteBatch on ${entity.modelName}`);
		modelFunctions.handleDeleteBatch(getModel(entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleDeleteBatch failed', err);
				next(err);
			});
	}

	function handleUpdateById(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleUpdateById on ${entity.modelName}`);
		modelFunctions.modelUpdateById(getModel(entity), req)
			.then(function (data) {
				if (data.skippedFields && data.skippedFields.length > 0) {
					res.setHeader(IGNORED_ATTRIBUTES, data.skippedFields.join());
				}
				res.json(data.item);
				next();
			}).catch(function (err) {
				debug('HandleUpdateById failed', err);
				next(err);
			});
	}

	return {
		getModel,
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