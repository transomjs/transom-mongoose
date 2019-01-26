'use strict';
// const http = require('http');
// const https = require('https');
// const assert = require('assert');
const querystring = require('qs');
const restifyErrors = require('restify-errors');
const {
	Schema
} = require('mongoose');

module.exports = function ModelUtils() {

	function toTitleCase(str) {
		// Replace all underscores with spaces and trim.
		str = str.replace(/_/g, " ").trim();
		// Capitalize the first character of each word.
		return str.replace(/\w\S*/g, function (txt) {
			return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
		});
	}

	function createDefault(attrib) {
		if (attrib.default === undefined || attrib.default === null) {
			return undefined;
		}
		if (typeof attrib.default === 'function') {
			return attrib.default;
		}
		if (typeof attrib.default === 'string') {
			// Otherwise, interpret it based on the attribute's datatype.
			let def;
			const attribDefault = attrib.default.toLowerCase();
			const tp = attrib.type ? attrib.type.toLowerCase() : "string";
			switch (tp) {
				case "boolean":
					switch (attribDefault) {
						case "true":
							def = function () {
								return true;
							};
							break;
						case "false":
							def = function () {
								return false;
							};
							break;
					}
					break;
				case "number":
					def = function () {
						const num = Number(attribDefault);
						return (num === NaN ? undefined : num);
					};
					break;
				case "date":
					if (attribDefault === "now") {
						// Create a UTC Date object regardless the server timezone.  YYYY-MM-DD HH:MM:SS.mmm
						def = function () {
							const dt = new Date();
							return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),
								dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds(), dt.getUTCMilliseconds()));
						}
					}
					break;
				case "string":
				default:
					def = function () {
						return attrib.default; // don't use the LowerCased value.
					};
					break;
			}
			return def;
		}

		// Use anything else (including functions) as-is.
		return function () {
			return attrib.default;
		};
	}

	// Map Transom datatypes to mongoose schema datatypes
	function mapToSchemaType(schemaType, customTypeKey) {
		if (typeof schemaType === 'string') {
			schemaType = schemaType.toLowerCase();
		}
		let result = {};
		switch (schemaType) {
			case "objectid":
			case "connector":
				result[customTypeKey] = Schema.Types.ObjectId
			break;
			case "string":
				result[customTypeKey] = Schema.Types.String
			break;
			case "boolean":
				result[customTypeKey] = Schema.Types.Boolean
			break;
			case "mixed":
				result[customTypeKey] = Schema.Types.Mixed
			break;
			case "date":
			case "datetime":
				result[customTypeKey] = Schema.Types.Date
			break;
			case "number":
            case 'integer':
            case 'int32':
            case 'int64':
            case 'float':
            case 'double':
				result[customTypeKey] = Schema.Types.Number
				break;
			case "binary":
				// In-database binary object.
				const binaryObj = {
					binaryData: {
						csv: false
					},
					filename: {
						name: 'Filename'
					},
					mimetype: {
						name: 'Mimetype'
					},
					size: {
						name: 'Size'
					}
				};
				binaryObj.binaryData[customTypeKey] = Schema.Types.Buffer;
				binaryObj.filename[customTypeKey] = Schema.Types.String;
				binaryObj.mimetype[customTypeKey] = Schema.Types.String;
				binaryObj.size[customTypeKey] = Schema.Types.Number;

				result = new Schema(binaryObj, {
					_id: false,
					typeKey: customTypeKey
				});
				break;
			case "point":
				// geoJSON point
				const pointObj = {
					type: {
					  enum: ['Point'],
					  required: true
					},
					coordinates: {
					  required: true
					}
				  };
				  pointObj.type[customTypeKey] = Schema.Types.String;
				  pointObj.coordinates[customTypeKey] = [Schema.Types.Number]; 
				result = new Schema(pointObj, {
					_id: false,
					typeKey: customTypeKey
				});
				break;
			default:
				result[customTypeKey] = schemaType || Schema.Types.String;
		}
		return result;
	}

	function parseUserQueryString(userQueryString) {
		// Apply User level query info!
		var qry; //  = {};
		// if (userQueryString) {
		qry = querystring.parse(userQueryString); // parse to Object
		// delete qry['']; // don't allow un-named properties here.
		//console.log(qry);
		//console.log("/dummy?" + userQueryString);
		// }
		return qry;
	}

	function customError(model, err, genericMsg) {
		var name = "String";
		var message = "";
		if (typeof err === 'string') {
			message = err;
		} else {
			if (err.name) {
				name = err.name;
			}
			if (err.errors) {
				// A Mongoose Error will have a collection of errors by Path.
				for (var merr in err.errors) {
					if (err.errors.hasOwnProperty(merr) && err.errors[merr].message) {
						if (message) {
							message += "; ";
						}
						message += err.errors[merr].message;
					}
				}
			}
			message = message || err.message;
		}

		// Total fallback error message
		message = message || genericMsg;

		var errObject;
		switch (name) {
			case "PreSaveError":
				errObject = new restifyErrors.BadRequestError(message);
				break;
			case "ValidationError":
				errObject = new restifyErrors.UnprocessableEntityError(message);
				break;
			case "String":
			default:
				errObject = new restifyErrors.InternalError(message);
				break;
		}
		return errObject;
	}

	// Strip out mongoose properties we don't want to share!
	function cleanJson(schema) {

		// doc: The mongoose document which is being converted
		// ret: The plain object representation which has been converted
		// options: The options in use (either schema options or the options passed inline)
		return function (doc, ret, options) {
			const result = {};
			Object.keys(ret).map((path) => {
				result[path] = ret[path];
			});
			// Reverse populate puts stuff here in the model
			const reverse = doc._reverse || {};
			Object.keys(reverse).map((path) => {
				result[path] = reverse[path];
			});
			delete result[schema.options.versionKey];
			return result;
		};
	}

	function constantsFunction() {
		return function (opts) {
			for (let key in this.schema.paths) {
				if (this[key] && typeof this[key] === "string") {
					const newValue = this[key].toLowerCase();
					let dataType;
					if (typeof this.schema.paths[key].options.type === 'function'){
						dataType = this.schema.paths[key].options.type.name.toLowerCase();
					} else {
						dataType = (this.schema.paths[key].options.type || 'string').toLowerCase();
					}
					if (dataType == 'boolean') {
						if (newValue === 'true') {
							this[key] = true;
						}
						if (newValue === 'false') {
							this[key] = false;
						}
					}
					if (newValue === 'now') {
						const today = new Date();
						const utcNow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(),
							today.getUTCHours(), today.getUTCMinutes(), today.getUTCSeconds(), today.getUTCMilliseconds()));
						if (dataType === 'date') {
							this[key] = utcNow;
						}
						if (dataType === 'string') {
							this[key] = utcNow.toISOString();
						}

					}
					if (dataType == 'string') {
						// if (newValue == 'current_username' && this.__currentUser) {
						// 	this[key] = this.__currentUser.username || this.__currentUser.email;
						// }
						// if (newValue == 'current_userid' && this.__currentUser) {
						// 	this[key] = this.__currentUser._id;
						// }
						if (newValue == 'current_username' && opts.user) {
							this[key] = opts.user.username || opts.user.email;
						}
						if (newValue == 'current_userid' && opts.user) {
							this[key] = opts.user._id;
						}
					}
					// Don't check the datatype for NULL.
					if (newValue == 'null') {
						this[key] = null;
					}
				}
			} // end for
		}
	}

	return {
		toTitleCase,
		createDefault,
		mapToSchemaType,
		parseUserQueryString,
		customError,
		cleanJson,
		constantsFunction
	};
}();