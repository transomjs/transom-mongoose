const assert = require('assert');
const modelUtils = require('../modelUtils');

module.exports = function (options) {
	// no init necessary at this point.
	return function (schema, options) {
		options = options || {};

		// Create static functions that return the csv-ified Entity.
		schema.statics.csvEscape = function (value) {
			var clean;
			if (value === undefined) {
				clean = '';
			} else if (typeof value === 'boolean') {
				clean = `"${value}"`;
			} else if (typeof value === 'object' && typeof value.getMonth === 'function') {
				clean = `"${value.toISOString()}"`;
			} else {
				// Everything else.
				clean = String(value || "").replace(/\"/g, '""');
				clean = `"${clean}"`;
				// Replace CRLF & CR with LF allowing Excel to parse LF's in csv data.
				clean = clean.replace(/(?:\r\n|\r)/g, '\n');
			}
			// Don't send empty double quotes.
			if (clean === '""') {
				clean = '';
			}
			return clean;
		};

		schema.statics.csvColumns = function (columns) {
			const csvPaths = (typeof columns === 'object') ? Object.keys(columns) : columns;
			const schemaPaths = Object.assign({}, this.schema.paths, this.schema.virtuals, this.schema.singleNestedPaths);

			return csvPaths.map((path) => {
					assert(schemaPaths[path], `Attribute ${path} not found on model.`);
					return path;
				})
				.filter((path) => {
					// Only dropped if specifically set to false.
					return (schemaPaths[path].options.csv !== false);
				})
				.sort((a, b) => {
					return schemaPaths[a].options.order - schemaPaths[b].options.order;
				});
		};

		/**
		 * 
		 * @param {*} model The mongoose model to use for querying
		 * @param {*} recurse Optionlly call getCsvColumns on a nested schema
		 */
		function getCsvColumns(model, recurse) {
			const schemaPaths = {}; // Collect schema paths for csv export.
			const schemaFields = {}; // Collect each field and it's numeric column sequence.
			const ORDER_OFFSET = 100000;

			// if (model) {

			Object.assign(schemaPaths, model.schema.paths, model.schema.virtuals);
			Object.keys(schemaPaths).map(function (key) {
				// Build a list of fields that we can use to sort and select model attributes.
				schemaFields[key] = schemaPaths[key].options.order || ORDER_OFFSET;
			});

			// Don't export the '__v' version key
			delete schemaPaths[model.schema.options.versionKey];
			delete schemaFields[model.schema.options.versionKey];

			// Don't export '_id' and the 'id' virtual
			if (model.schema.options._id && model.schema.options.id) {
				delete schemaPaths['id'];
				delete schemaFields['id'];
			}

			Object.keys(schemaPaths).map(function (path) {
				if (model.schema.paths[path]) {
					// Don't export paths explicitly excluded from csv
					if (model.schema.paths[path].options.csv === false) {
						delete schemaPaths[path];
						delete schemaFields[path];
					} else if (model.schema.paths[path].options.ref) {
						// Don't export reference attributes as a model
						// but leave ref paths in the schemaFields object.
						delete schemaPaths[path];
						delete schemaFields[path];
						if (recurse) {
							// Go through referenced (joined) models, adding those paths too!
							const reference = getCsvColumns(model.db.models[model.schema.paths[path].options.ref], false);
							Object.keys(reference.schemaPaths).map(function (refPath) {
								// Put ref child fields in order behind their parent
								const refKey = `${path}.${refPath}`;
								schemaPaths[refKey] = reference.schemaPaths[refPath];
								const childOrder = (schemaPaths[refKey].options.order || ORDER_OFFSET) / ORDER_OFFSET;
								schemaFields[refKey] = (model.schema.paths[path].options.order || ORDER_OFFSET) + childOrder;
							});
						}
					}
					if (model.schema.paths[path].$isSingleNested) {
						// Don't export nested schema attributes as a model
						delete schemaPaths[path];
						delete schemaFields[path];
					}
				}
				if (model.schema.virtuals[path]) {
					// Don't export virtuals explicitly excluded from csv
					if (model.schema.virtuals[path].options.csv === false) {
						delete schemaPaths[path];
						delete schemaFields[path];
					}
				}
			});

			// Pull in the SingleNested schemas
			Object.keys(model.schema.singleNestedPaths).map(function (path) {
				schemaPaths[path] = model.schema.singleNestedPaths[path];
				schemaFields[path] = 1;
			});
			// }
			// Sort the schemaFields into an array of keys
			const select = Object.keys(schemaFields).sort((a, b) => {
				// compare numeric values, else fallback to alphabetic on keys
				const result = schemaFields[a] - schemaPaths[b];
				return (result === 0 ? a.localeCompare(b) : result);
			});

			return {
				select, // validated and sorted keys
				schemaPaths // schema paths
			};
		}

		schema.statics.csvHeaderRow = function (includeFields, applySort) {
			const csvPaths = getCsvColumns(this, true);
			let selectedColPaths;

			// Convert fields Object to an Array
			if (includeFields && !Array.isArray(includeFields)) {
				includeFields = Object.keys(includeFields);
			}
			// Only use the fields provided - if there are any.
			if (includeFields.length > 0) {
				if (applySort === false) {
					// Use the paths unchecked and unsorted!
					selectedColPaths = includeFields;
				} else {
					// Use the sorted paths, filtering to the ones provided.
					selectedColPaths = csvPaths.select.filter(function (key) {
						return (includeFields.indexOf(key) > -1);
					});
				}
			} else {
				selectedColPaths = csvPaths.select;
			}

			const result = {
				fields: selectedColPaths
			};
			result.header = selectedColPaths.map(function (path) {
					// Make a pretty name, if there isn't already one
					if (!csvPaths.schemaPaths[path].options.name) {
						csvPaths.schemaPaths[path].options.name = modelUtils.toTitleCase(path.replace(/\./g, ' '));
					}
					return path;
				})
				.map(function (path) {
					// Csv-escape the path names
					return schema.statics.csvEscape(csvPaths.schemaPaths[path].options.name);
				})
				.join(', ') + '\n';
			return result;
		};

		schema.methods.csvDataRow = function (sortedPaths) {
			return sortedPaths.map((path) => {
					// Csv-escape the data values, including the nested ones
					const parts = path.split('.');
					return schema.statics.csvEscape(parts.length === 2 ? this[parts[0]][parts[1]] : this[path]);
				})
				.join(', ') + '\n';
		};
	}
}