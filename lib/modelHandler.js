"use strict";

const ModelFunctions = require('./modelFunctions.js');

module.exports = function ModelHandler(options) {

	const IGNORED_ATTRIBUTES = 'Ignored-Attributes';
	
	const mongoose = options.mongoose;
	const modelFunctions = ModelFunctions({
		mongoose
	});

	function handleFind(req, res, next) {
		const modelName = req.params.__entity;
		//
		modelFunctions.modelFind(mongoose.model(modelName), req)
			.then(function (data) {
				if (req.params._type === "csv") {
					res.setHeader('content-disposition', `attachment; filename=${modelName}-data.csv`);
					res.setHeader('content-type', 'text/csv');
					// Write the file starting with a header row.
					try {
						const csv = model.csvHeaderRow(data.fields);
						res.write(csv.header);
						data.items.map(function (item) {
							res.write(item.csvDataRow(csv.fields));
						});
					} catch (err) {
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
				next(err);
			});
	};

	function handleFindById(req, res, next) {
		modelFunctions.modelFindById(mongoose.model(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				next(err);
			});
	};

	function handleFindBinary(req, res, next) {
		modelFunctions.modelFindBinary(mongoose.model(req.params.__entity), req)
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
				next(err);
			});
	}

	function handleCount(req, res, next) {
		modelFunctions.modelCount(mongoose.model(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				next(err);
			});
	}

	function handleInsert(req, res, next) {
		modelFunctions.modelInsert(mongoose.model(req.params.__entity), req)
			.then(function (data) {
				if (data.skippedFields && data.skippedFields.length > 0) {
					res.setHeader(IGNORED_ATTRIBUTES, data.skippedFields.join());
				}
				res.json(data.item);
				next();
			}).catch(function (err) {
				next(err);
			});
	}

	function handleDelete(req, res, next) {
		modelFunctions.modelDelete(mongoose.model(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				next(err);
			});
	}

	function handleDeleteById(req, res, next) {
		modelFunctions.modelDeleteById(mongoose.model(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				next(err);
			});
	}

	function handleDeleteBatch(req, res, next) {
		modelFunctions.handleDeleteBatch(mongoose.model(req.params.__entity), req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				next(err);
			});
	}

	function handleUpdateById(req, res, next) {
		modelFunctions.modelUpdateById(mongoose.model(req.params.__entity), req)
			.then(function (data) {
				if (data.skippedFields && data.skippedFields.length > 0) {
					res.setHeader(IGNORED_ATTRIBUTES, data.skippedFields.join());
				}
				res.json(data.item);
				next();
			}).catch(function (err) {
				next(err);
			});
	}

	return {
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