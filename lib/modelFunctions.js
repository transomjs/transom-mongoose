"use strict";
const assert = require('assert');
const async = require('async');
const debug = require('debug')('transom:mongoose:functions');
const {
    Types
} = require('mongoose');
const HandlerUtils = require('./handlerUtils');
const restifyErrors = require('restify-errors');

module.exports = function ModelFunctions(options) {
    const mongoose = options.mongoose;
    const collations = options.collations;
    
    const handlerUtils = new HandlerUtils({
        mongoose, 
        collations
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
                    const funcs = handlerUtils.buildReversePopulateFunctions(query, items);
                    if (funcs.length > 0) {
                        debug(`Executing ${funcs.length} functions for reverse populate`);
                        async.waterfall(funcs,
                            // The final callback sends the response.
                            function (err, items) {
                                if (err) {
                                    debug('Error executing reverse populate', err);
                                    reject(err);
                                    return;
                                }
                                debug('Fetching find() with reverse populate completed');
                                resolve({
                                    // fields is an array of selected attributes that gets used when outputting to CSV.
                                    fields: query._fields,
                                    items
                                });
                            });
                    } else {
                        debug('Fetching find() completed');
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
            const typeKey = model.schema.options.typeKey;
            const selectOpts = handlerUtils.processSelectOperator(model, operations['_select'], typeKey);

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
            const typeKey = model.schema.options.typeKey;
            const isBinary = pathOpts[typeKey] && pathOpts[typeKey].__type === 'binary';
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
            const values = Object.assign({}, req.body, req.files);

            // Check that provided values map to the Entity.
            const skippedFields = [];
            Object.keys(values || {}).map(function (path) {
                if (!model.schema.paths.hasOwnProperty(path)) {
                    delete values[path];
                    skippedFields.push(path);
                }
            });

            const doc = handlerUtils.applyValues(new model(), values, model, true);

            // Set Constant values on the model (It's not recursive!)
            if (typeof doc.setConstants === 'function') {
                doc.setConstants({
                    user: req.locals.user
                });
            }
            // Set the audit field values
            doc.modifiedBy = req.locals.user;

            if (!doc._id){
                //create a new _id if one is not provided
                doc['_id'] = Types.ObjectId().toHexString();    
            }
            
            // TODO: Set the ACL Group on new records
            // 1) pull a default Group / value from the API Definition.
            // 2) pull a name / value from the HTTP request

            // Make sure the model uses ACL before calling it.
            if (typeof doc.aclCreate === 'function') {
                try {
                    doc.aclCreate(req);
                } catch (err) {
                    return reject(err);
                }
            }
            doc.save().then(function (item) {
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
                .then(function (result) {
                    // As of Mongoose version 5.x, the value coming out of remove() 
                    // no longer includes a nested 'result' property.
                    // removed.result looks like: { "ok": 1, "n": 2 } where 'n' is the number removed.
                    resolve({
                        data: {
                            deleted: (result.ok === 1 ? result.n : -1)
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
            query.remove().then(function (result) {
                // As of Mongoose version 5.x, the value coming out of remove() 
                // no longer includes a nested 'result' property.
                // result looks like: { "ok": 1, "n": 2 } where 'n' is the number removed.
                // If NOT ok, return "-1".
                if (result.ok === 1 && result.n === 1) {
                    debug(query.model.collection.name + " record was deleted.");
                } else {
                    debug(query.model.collection.name + " record was not deleted. Conditions: %j", query._conditions);
                }
                resolve({
                    deleted: (result.ok === 1 ? result.n : -1)
                });
            }).catch(function (err) {
                debug("modelDeleteById failed. Conditions: %j", query._conditions);
                return reject(err);
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

            const values = Object.assign({}, req.body, req.files);

            // Check that provided values map to the Entity.
            const skippedFields = [];
            Object.keys(values || {}).map(function (path) {
                if (!model.schema.paths.hasOwnProperty(path)) {
                    delete values[path];
                    skippedFields.push(path);
                }
            });

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
                doc = handlerUtils.applyValues(doc, values, model, false);

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