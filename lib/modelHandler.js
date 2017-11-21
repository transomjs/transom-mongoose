"use strict";
const debug = require('debug')('transom:mongoose:handler');
const ModelFunctions = require('./modelFunctions');

module.exports = function ModelHandler(options) {

	const IGNORED_ATTRIBUTES = 'Ignored-Attributes';
	const mongoose = options.mongoose;
	const modelPrefix = options.modelPrefix;

	const modelFunctions = ModelFunctions({mongoose});

	function getModel(entity) {
		return mongoose.model(modelPrefix + entity);
	}

	function handleFind(req, res, next) {
		debug(`HandleFind on ${req.params.__entity}`);
		modelFunctions.modelFind(getModel(req.params.__entity), req)
			.then(function (data) {
				if (req.params._type === "csv") {
					debug('Converting handleFind results to CSV.');
					res.setHeader('content-disposition', `attachment; filename=${req.params.__entity}-data.csv`);
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
				debug(`HandleFindById failed`, err);
				next(err);
			});
	};

	function handleFindById(req, res, next) {
		debug(`HandleFindById on ${req.params.__entity}`);
		modelFunctions.modelFindById(getModel(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleFindById failed', err);
				next(err);
			});
	};

	function handleFindBinary(req, res, next) {
		debug(`HandleFindBinary on ${req.params.__entity}`);
		modelFunctions.modelFindBinary(getModel(req.params.__entity), req)
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
		debug(`HandleCount on ${req.params.__entity}`);
		modelFunctions.modelCount(getModel(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleCount failed', err);
				next(err);
			});
	}

	function handleInsert(req, res, next) {
		debug(`HandleInsert on ${req.params.__entity}`);
		modelFunctions.modelInsert(getModel(req.params.__entity), req)
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
		debug(`HandleDelete on ${req.params.__entity}`);
		modelFunctions.modelDelete(getModel(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleDelete failed', err);
				next(err);
			});
	}

	function handleDeleteById(req, res, next) {
		debug(`HandleDeleteById on ${req.params.__entity}`);
		modelFunctions.modelDeleteById(getModel(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleDeleteById failed', err);
				next(err);
			});
	}

	function handleDeleteBatch(req, res, next) {
		debug(`HandleDeleteBatch on ${req.params.__entity}`);
		modelFunctions.handleDeleteBatch(getModel(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleDeleteBatch failed', err);
				next(err);
			});
	}

	function handleUpdateById(req, res, next) {
		debug(`HandleUpdateById on ${req.params.__entity}`);
		modelFunctions.modelUpdateById(getModel(req.params.__entity), req)
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