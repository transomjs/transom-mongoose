"use strict";
const assert = require('assert');
const async = require('async');
const debug = require('debug')('transom:mongoose:functions');
const fs = require('fs');
const {
    Types
} = require('mongoose');
const HandlerUtils = require('./handlerUtils');
const restifyErrors = require('restify-errors');

module.exports = function ModelFunctions(options) {

    const mongoose = options.mongoose;
    const handlerUtils = new HandlerUtils({
        mongoose
    });

    function modelFind(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            const query = handlerUtils.buildQuery(model.find(), req, entity);

            // Make sure the model uses ACL before calling it.
            if (typeof query.aclRead === 'function') {
                debug(`Adding ACL Read to ${entity.modelName} find() query`);
                query.aclRead(req);
            }

            query.exec().then(function (items) {
                // **********************************
                // Setup a ReversePopulate query!
                // **********************************
                try {
                    // throw new Error('Boo!');  // **************************************
                    const funcs = handlerUtils.buildReversePopulateFunctions(query, items);
                    if (funcs.length > 0) {
                        debug(`Executing ${funcs.length} functions for reverse populate`);
                        async.waterfall(funcs,
                            // The final callback sends the response.
                            function (err, items) {
                                if (err) {
                                    debug('Error executing reverse populate', err);
                                    // return reject(err);
                                    reject(err);
                                }
                                debug('Fetching find() with reverse populate completed');
                                // return resolve({
                                resolve({
                                    // fields is an array of selected attributes that gets used when outputting to CSV.
                                    fields: query._fields,
                                    items
                                });
                            });
                    } else {
                        debug('Fetching find() completed');
                        // return resolve({
                        resolve({
                            // fields is an array of selected attributes that gets used when outputting to CSV.
                            fields: query._fields,
                            items
                        });
                    }
                } catch (err) {
                    reject(err);
                }
            }).catch(function (err) {
                debug(`Error executing ${entity.modelName} model find() in reversePopulate`, err);
                reject(err);
            });
        });
    }

    function modelFindById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            let id;
            try {
                id = new Types.ObjectId(req.params.__id);
            } catch (err) {
                debug(`Invalid Id in ${entity.modelName} findById: ${req.params.__id}`);
                return reject(new restifyErrors.InvalidArgumentError('Invalid ID format'));
            }

            let query = model.findOne();
            query.and({
                '_id': id
            });

            // Used for Select & Populate.
            const separated = handlerUtils.separateApiOperations(req.query, model);
            const operations = separated.operands;

            // Build the select for this query.
            const selectOpts = handlerUtils.processSelectOperator(model, operations['_select']);

            // Connect related models
            if (operations['_connect']) {
                debug(`Adding Connect operation to ${entity.modelName} findById query`);
                // Will setup the query to call populate or setup details required for reversePopulate!
                const connect = handlerUtils.processConnectOperator({
                    query,
                    operations,
                    entity,
                    selectOpts
                });
                query = handlerUtils.applyConnectOperator({
                    query,
                    connect,
                    modelPrefix: entity.modelPrefix
                });

                // We need to add the connected attribute(s) to our select list.
                if (connect.rootSelect && selectOpts.applyRoot) {
                    for (let i in connect.rootSelect) {
                        const path = connect.rootSelect[i];
                        selectOpts.root[path] = 1;
                    }
                }
            }
            // Apply the select list *after* we process the _connect operator.
            if (selectOpts.applyRoot) {
                query.select(selectOpts.root);
            }
            // Make sure the model uses ACL before calling it.
            if (typeof query.aclRead === 'function') {
                debug(`Adding ACL Read to ${entity.modelName} findById query`);
                query.aclRead(req);
            }

            query.exec().then(function (item) {
                if (!item) {
                    debug(`Model ${entity.modelName} findById() record not found`);
                    return reject(new restifyErrors.NotFoundError('Not Found'));
                }
                const funcs = handlerUtils.buildReversePopulateFunctions(query, item);
                if (funcs.length > 0) {
                    debug(`Executing ${funcs.length} functions for reverse populate`);
                    async.waterfall(funcs,
                        // The final callback sends the response.
                        function (err, items) {
                            if (err) {
                                return reject(err);
                            }
                            resolve(items[0]);
                        }
                    );
                } else {
                    resolve(item);
                }
            }).catch(function (err) {
                debug(`Error executing model ${entity.modelName} findById()`, err);
                reject(err);
            });
        });
    }

    function modelFindBinary(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            const pathOpts = model.schema.path(req.params.__attribute).options;
            const isBinary = pathOpts.type && pathOpts.type.__type === 'binary';
            assert(isBinary, `${model.modelName}.${req.params.__attribute} does not support this operation`);
            let id;
            try {
                id = new Types.ObjectId(req.params.__id);
            } catch (err) {
                debug(`Invalid Id in ${entity.modelName} findBinary: ${req.params.__id}`);
                return reject(new restifyErrors.InvalidArgumentError('Invalid ID format'));
            }
            const query = model.findOne();
            query.and({
                '_id': id
            });

            const selectAttribute = {};
            selectAttribute[`${req.params.__attribute}`] = 1;
            query.select(selectAttribute);

            // Make sure the model uses ACL before calling it.
            if (typeof query.aclRead === 'function') {
                debug(`Adding ACL Read to ${entity.modelName} findBinary query`);
                query.aclRead(req);
            }

            query.exec().then(function (item) {
                if (!item || !item[req.params.__attribute]) {
                    debug(`Item or Attribute not found in ${entity.modelName} findBinary query`);
                    return reject(new restifyErrors.NotFoundError('Not Found'));
                }
                resolve(item[req.params.__attribute]);
            }).catch(function (err) {
                debug(`Error executing model ${entity.modelName} findBinary()`, err);
                reject(err);
            });
        });
    }

    function modelCount(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {

            const query = handlerUtils.buildQuery(model.countDocuments(), req, entity);
            query.lean(true);

            // Make sure the model uses ACL before calling it.
            if (typeof query.aclRead === 'function') {
                debug(`Adding ACL Read to ${entity.modelName} modelCount query`);
                query.aclRead(req);
            }

            query.exec().then(function (count) {
                resolve({
                    count
                });
            });
        });
    }

    function modelInsert(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {

            // Check that provided values map to the Entity.
            const skippedFields = [];
            Object.keys(req.body || {}).map(function (path) {
                if (!model.schema.paths.hasOwnProperty(path)) {
                    skippedFields.push(path);
                }
            });

            const modelInstance = new model();

            for (var key in model.schema.paths) {
                if (!(key === '_id' || key === model.schema.options.versionKey || key === model.schema.options.aclKey)) {
                    if (model.schema.path(key) && req.params[key]) {
                        // Apply the provided value to the ModelInstance
                        modelInstance[key] = req.params[key];
                    } else {
                        // ModelCreator will create Default functions as needed.
                        // if (typeof modelType.schema.path(key).default === 'function') {
                        // 	modelInstance[key] = modelType.schema.path(key).default;
                        // }
                    }
                }
            }

            // Set Constant values on the model (It's not recursive!)
            if (typeof modelInstance.setConstants === 'function') {
                modelInstance.setConstants({
                    user: req.locals.user
                });
            }
            // Set the audit field values
            modelInstance.modifiedBy = req.locals.user;

            // *ALWAYS* set an _id for new Documents!
            modelInstance['_id'] = Types.ObjectId().toHexString();

            // TODO: Set the ACL Group on new records
            // 1) pull a default Group / value from the API Definition.
            // 2) pull a name / value from the HTTP request

            // Make sure the model uses ACL before calling it.
            if (typeof modelInstance.aclCreate === 'function') {
                try {
                modelInstance.aclCreate(req);
                } catch (err) {
                    return reject(err);
                }
            }
            modelInstance.save().then(function (item) {
                resolve({
                    item,
                    skippedFields
                });
            }).catch(function (err) {
                debug(`Error executing ${entity.modelName} modelInsert`, err);
                reject(err);
            });
        });
    }

    function modelDelete(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {

            // TODO: this needs to be updated to ignore all the _select & _connect bits!
            const query = handlerUtils.buildQuery(model.find(), req, entity);

            if (typeof query.aclDelete === 'function') {
                query.aclDelete(req);
            }

            debug(`modelDelete is not implemented.`);
            reject(new Error("Not yet implemented!"));

            query.remove()
                .then(function (removed) {
                    // removed.result looks like: { "ok": 1, "n": 2 } where 'n' is the number removed.
                    resolve({
                        data: {
                            deleted: (removed.result.ok == 1 ? removed.result.n : -1)
                        }
                    });
                }).catch(function (err) {
                    debug(`Error executing ${entity.modelName} modelDelete`, err);
                    reject(err);
                });
        });
    }

    function modelDeleteById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            let id;
            try {
                id = new Types.ObjectId(req.params.__id);
            } catch (err) {
                return reject(err);
            }

            const query = model.findOne();
            query.and({
                '_id': id
            });

            if (typeof query.aclDelete === 'function') {
                query.aclDelete(req);
            }
            query.remove()
                .then(function (removed) {
                    // removed.result looks like: { "ok": 1, "n": 2 } where 'n' is the number removed.
                    // If NOT ok, return "-1".
                    resolve({
                        deleted: (removed.result.ok == 1 ? removed.result.n : -1)
                    });
                }).catch(function (err) {
                    return Promise.reject(err);
                });
        });
    }

    function modelDeleteBatch(entity, req) {
        const model = entity.model;
        var p = new Promise(function (resolve, reject) {
            const deleteIdList = (req.body || {}).id;
            if (!deleteIdList) {
                return reject(new Error('Request body must contain an "id" field containing the array of record ID values to delete.'));
            }

            // If user provided a single string value.
            if (typeof deleteIdList === 'string') {
                deleteIdList = [deleteIdList];
            }

            // Convert string Id's into ObjectIds
            const deleteIds = [];
            try {
                deleteIdList.map(function (id) {
                    deleteIds.push(new Types.ObjectId(req.params.__id));
                });
            } catch (err) {
                return reject(err);
            }

            const query = model.find();
            query.and({
                '_id': {
                    '$in': deleteIds
                }
            });

            if (typeof query.aclDelete === 'function') {
                query.aclDelete(req);
            }
            return resolve(query);
        }).then(function (query) {
            return query.remove();
        }).then(function (removed) {
            // removed.result looks like: { "ok": 1, "n": 2 } where 'n' is the number removed.
            // If NOT ok, return "-1".
            return Promise.resolve({
                deleted: (removed.result.ok == 1 ? removed.result.n : -1)
            });
        }).catch(function (err) {
            return Promise.reject(err);
        });
    }

    function modelUpdateById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            let id;
            try {
                id = new Types.ObjectId(req.params.__id);
            } catch (err) {
                return reject(err);
            }

            var skippedFields = [];
            var options = Object.assign({}, req.body, req.files);

            // Check that provided values map to the Entity.
            for (var key in options) {
                if (!model.schema.paths.hasOwnProperty(key)) {
                    delete options[key];
                    skippedFields.push(key);
                }
            }

            const query = model.findOne();
            query.and({
                '_id': id
            });
            if (typeof query.aclWrite === 'function') {
                query.aclWrite(req);
            }

            // Build a select list for this query that filters out any Binary data fields.
            const selectOpts = handlerUtils.processSelectOperator(model, null);
            if (selectOpts.applyRoot) {
                query.select(selectOpts.root);
            }

            query.exec().then(function (doc) {
                if (!doc) {
                    return reject(new restifyErrors.NotFoundError('Not Found'));
                }
                // Apply provided values to the Object..
                for (var key in options) {
                    if (!(key === '_id' || key === model.schema.options.versionKey || key === model.schema.options.aclKey)) {
                        var newValue = options[key];
                        const pathOpts = model.schema.path(key).options;
                        if (pathOpts.type && pathOpts.type.__type === 'binary') {
                            if (typeof newValue === 'object' && newValue.path) {
                                doc[key] = {
                                    binaryData: fs.readFileSync(newValue.path),
                                    filename: newValue.name,
                                    mimetype: newValue.type,
                                    size: newValue.size
                                };
                            }
                        } else {
                            switch (newValue) {
                                case "NULL":
                                    doc[key] = undefined; // whack it from the Object
                                    break;
                                    //case "NOW":
                                    //	doc[key] = undefined; // timestamp
                                    //	break;
                                    // case "CURRENT_USERNAME":
                                    // 	doc[key] = req.locals.user.username || req.locals.user.email;
                                    // 	break;
                                default:
                                    doc[key] = newValue;
                                    break;
                            }
                        }
                    }
                }
                // Insert the authenticated User here.
                doc.modifiedBy = req.locals.user;
                doc.save().then(function (item) {
                    resolve({
                        item,
                        skippedFields
                    });
                }).catch(function (err) {
                    reject(err);
                });
            }).catch(function (err) {
                reject(err);
            });
        });
    }

    return {
        modelFind,
        modelFindById,
        modelFindBinary,
        modelCount,
        modelInsert,
        modelDelete,
        modelDeleteById,
        modelDeleteBatch,
        modelUpdateById
    };
};