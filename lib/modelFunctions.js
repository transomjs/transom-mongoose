"use strict";

const assert = require('assert');
const async = require('async');
const fs = require('fs');
const {
    Types
} = require('mongoose');
const handlerUtils = require('./handlerUtils');
const restifyErrors = require('restify-errors');

module.exports = function ModelFunctions(options) {

    var mongoose = options.mongoose;

    function modelFind(model, req) {
        return new Promise(function (resolve, reject) {
            const query = handlerUtils.buildQuery(model.find(), req, model);

            // Make sure the model uses ACL before calling it.
            if (typeof query.aclRead === 'function') {
                query.aclRead(req);
            }

            query.exec()
                .then(function (items) {
                    // **********************************
                    // Setup a ReversePopulate query!
                    // **********************************
                    var funcs = handlerUtils.buildReversePopulateFunctions(query, items);
                    if (funcs.length > 0) {
                        async.waterfall(funcs,
                            // The final callback sends the response.
                            function (err, items) {
                                if (err) {
                                    return reject(err);
                                }
                                resolve({
                                    // fields is an array of selcted attributes that gets used when outputting to CSV.
                                    fields: query._fields,
                                    items
                                });
                            });
                    } else {
                        resolve({
                            // fields is an array of selcted attributes that gets used when outputting to CSV.
                            fields: query._fields,
                            items
                        });
                    }
                }).catch(function (err) {
                    reject(err);
                });
        });
    }

    function modelFindById(model, req) {
        return new Promise(function (resolve, reject) {
            let id;
            // try {
            id = new Types.ObjectId(req.params.__id);
            // } catch (err) {
            //     return reject(new restifyErrors.InvalidArgumentError('Invalid ID format'));
            // }

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
                // Will setup the query to call populate or setup details required for reversePopulate!
                const connect = handlerUtils.processConnectOperator({
                    mongoose,
                    query,
                    operations,
                    model,
                    selectOpts
                });
                query = handlerUtils.applyConnectOperator({
                    mongoose,
                    query,
                    connect
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
                query.aclRead(req);
            }

            query.exec()
                .then(function (item) {
                    if (!item) {
                        return reject(new Error('Not Found'));
                    }

                    const funcs = handlerUtils.buildReversePopulateFunctions(query, item);
                    if (funcs.length > 0) {
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
                    reject(err);
                });
        });
    }

    function modelFindBinary(model, req) {
        return new Promise(function (resolve, reject) {
            assert(model.schema.paths[req.params.__attribute].options.type.isBinary,
                `${model.modelName}.${req.params.__attribute} does not support this operation`);

            let id;
            try {
                id = new Types.ObjectId(req.params.__id);
            } catch (err) {
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
                query.aclRead(req);
            }

            query.exec()
                .then(function (item) {
                    if (!item || !item[req.params.__attribute]) {
                        return reject(new Error('Not Found'));
                    }
                    resolve(item[req.params.__attribute]);
                }).catch(function (err) {
                    reject(err);
                });
        });
    }

    function modelCount(model, req) {
        return new Promise(function (resolve, reject) {

            const query = handlerUtils.buildQuery(model.count(), req, model);
            query.lean(true);

            // Make sure the model uses ACL before calling it.
            if (typeof query.aclRead === 'function') {
                query.aclRead(req);
            }

            query.exec().then(function (count) {
                resolve({
                    count
                });
            }).catch(function (err) {
                reject(err);
            });
        });
    }

    function modelInsert(model, req) {
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
            modelInstance.setConstants({
                user: req.locals.user
            });

            // Set the audit field values
            modelInstance.modifiedBy = req.locals.user;

            // *ALWAYS* set an _id for new Documents!
            modelInstance['_id'] = Types.ObjectId().toHexString();

            // TODO: Set the ACL Group on new records
            // 1) pull a default Group / value from the API Definition.
            // 2) pull a name / value from the HTTP request

            // Make sure the model uses ACL before calling it.
            if (typeof modelInstance.aclCreate === 'function') {
                modelInstance.aclCreate(req);
            }

            modelInstance.save()
                .then(function (item) {
                    resolve({
                        item,
                        skippedFields
                    });
                }).catch(function (err) {
                    reject(err);
                });
        });
    }

    function modelDelete(model, req) {
        return new Promise(function (resolve, reject) {

            // TODO: this needs to be updated to ignore all the _select & _connect bits!
            const query = handlerUtils.buildQuery(model.find(), req, model);

            if (typeof query.aclDelete === 'function') {
                query.aclDelete(req);
            }

            reject(new Error("Not yet implemented!"));

            query.remove().exec()
                .then(function (removed) {
                    // removed.result looks like: { "ok": 1, "n": 2 } where 'n' is the number removed.
                    resolve({
                        data: {
                            deleted: (removed.result.ok == 1 ? removed.result.n : -1)
                        }
                    }).catch(function (err) {
                        reject(err);
                    });
                });
        });
    }

    function modelDeleteById(model, req) {
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
                    reject(err);
                });

        });
    }

    function modelDeleteBatch(model, req) {
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

            query.remove()
                .then(function (removed) {
                    // removed.result looks like: { "ok": 1, "n": 2 } where 'n' is the number removed.
                    // If NOT ok, return "-1".
                    resolve({
                        deleted: (removed.result.ok == 1 ? removed.result.n : -1)
                    });
                }).catch(function (err) {
                    reject(err);
                });

        });
    }

    function modelUpdateById(model, req) {
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

            query.exec()
                .then(function (doc) {
                    if (!doc) {
                        return reject(new Error('Not Found'));
                    }
                    // Apply provided values to the Object..
                    for (var key in options) {
                        if (!(key === '_id' || key === model.schema.options.versionKey || key === model.schema.options.aclKey)) {
                            var newValue = options[key];
                            if (typeof newValue === 'object' && newValue.path) {
                                assert(model.schema.paths[key].options.type.isBinary, 
                                    `${key} is not defined as a 'binary' type attribute.`);
                                doc[key] = {
                                    binaryData: fs.readFileSync(newValue.path),
                                    filename: newValue.name,
                                    mimetype: newValue.type,
                                    size: newValue.size
                                };
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

                    doc.save()
                        .then(function (item) {
                            resolve({
                                item,
                                skippedFields
                            });
                        }).catch(function (err) {
                            reject(err);
                        });
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