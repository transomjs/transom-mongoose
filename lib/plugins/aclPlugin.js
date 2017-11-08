/**
 * This is a Mongoose schema plugin.
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
module.exports.AclPlugin = function (options) {

    const {
        Schema
    } = require('mongoose');

    const DELETE = 4; // leftmost position
    const UPDATE = 2; // middle position
    const READ = 1; // rightmost position
    const BITWISE_DELETE = 2; // leftmost position
    const BITWISE_UPDATE = 1; // middle position
    const BITWISE_READ = 0; // rightmost position
    // Valid values include:
    // 7 = DELETE, UPDATE, READ
    // 6 = DELETE, UPDATE
    // 5 = DELETE, READ
    // 4 = DELETE
    // 3 = UPDATE, READ
    // 2 = UPDATE
    // 1 = READ
    // 0 = Nil

    const CONSTANTS = {
        CREATE: "CREATE",
        READ: "READ",
        UPDATE: "UPDATE",
        DELETE: "DELETE"
    };

    const aclKey = options.aclKey || "_acl";
    const aclDefault = (options.entity && options.entity.acl ? options.entity.acl.default : undefined) || {};

    const publik = (aclDefault.public !== undefined ? aclDefault.public : (READ | UPDATE | DELETE));
    const owner = (aclDefault.owner ? aclDefault.owner : {
        "CURRENT_USERID": (READ | UPDATE | DELETE)
    });
    const groups = (aclDefault.groups ? aclDefault.groups : {});

    const defaultAcl = {
        "public": publik,
        owner,
        groups
    }

    return function (schema, options) {
        const aclType = {
            public: {
                type: Number,
                required: true,
                default: publik
            },
            owner: {
                type: Schema.Types.Mixed,
                required: true,
                default: owner
            },
            groups: {
                type: Schema.Types.Mixed,
                required: true,
                default: groups
            }
        };

        const field = {};
        field[aclKey] = {
            type: aclType,
            default: defaultAcl,
            required: true,
            csv: false
        };
        schema.add(field);

        schema.statics.aclQuery = function (req) {
            const hasRead = {
                $bitsAnySet: [BITWISE_READ]
            };
            const hasUpdate = {
                $bitsAnySet: [BITWISE_UPDATE]
            };
            const hasDelete = {
                $bitsAnySet: [BITWISE_DELETE]
            };

            let aclAction;
            const aclOperation = req.locals.acl || "NONE";
            switch (aclOperation) {
            case CONSTANTS.UPDATE:
                aclAction = hasUpdate;
                break;
            case CONSTANTS.DELETE:
                aclAction = hasDelete;
                break;
            case CONSTANTS.READ:
                aclAction = hasRead;
                break;
            default:
                aclAction = -1; // Will affect no rows.
                break;
            }

            const aclArray = [];
            const publik = {};
            publik[`${aclKey}.public`] = aclAction;
            aclArray.push(publik);

            const user = req.locals.user || {};
            if (user._id) {
                const owner = {};
                owner[`${aclKey}.owner.${user._id}`] = aclAction;
                aclArray.push(owner);
            }
            if (user.groups) {
                for (let group of user.groups) {
                    const grp = {};
                    grp[`${aclKey}.groups.${group}`] = aclAction;
                    aclArray.push(grp);
                }
            }
            return {
                $or: aclArray
            };
        }

        schema.options.aclKey = aclKey;

        schema.statics.aclConstants = {
            READ: 1,
            UPDATE: 2,
            READ_UPDATE: 3,
            DELETE: 4,
            READ_DELETE: 5,
            UPDATE_DELETE: 6,
            READ_UPDATE_DELETE: 7
        };

        schema.statics.setAclDefaults = function (req) {
            var model = this;
            if (model.isNew && model[aclKey]) {
                // Set a default value for public...
                model[aclKey].public = defaultAcl.public;
                // Replace Owner & Group defaults of CURRENT_USERID with the actual UserId.
                const props = ["owner", "groups"];
                props.forEach(function (prop) {
                    const aclProp = model[aclKey][prop];
                    if (aclProp && aclProp["CURRENT_USERID"]) {
                        // Copy the value & delete the key.
                        aclProp[req.locals.user._id] = aclProp["CURRENT_USERID"];
                        delete aclProp["CURRENT_USERID"];
                    }
                });
            }
        }

        // http://mongoosejs.com/docs/guide.html#query-helpers
        schema.query.aclCheck = function (aclOperation, req) {
            if (aclOperation === CONSTANTS.READ ||
                aclOperation === CONSTANTS.UPDATE ||
                aclOperation === CONSTANTS.DELETE) {
                req.locals.acl = aclOperation;
                const aclQuery = schema.statics.aclQuery(req);
                return this.and(aclQuery);
            }
            throw new Error(`Unhandled ACL check: ${aclOperation}`);
        };

        schema.methods.aclCreate = function (req) {
            return schema.statics.setAclDefaults.call(this, req);
        }

        schema.query.aclRead = function (req) {
            return schema.query.aclCheck.call(this, CONSTANTS.READ, req);
        }
        schema.query.aclWrite = function (req) {
            return schema.query.aclCheck.call(this, CONSTANTS.UPDATE, req);
        }
        schema.query.aclDelete = function (req) {
            return schema.query.aclCheck.call(this, CONSTANTS.DELETE, req);
        }

        // Instance method to change Owner.
        schema.methods.chown = function (ownerVal) {
            var self = this;
            self[aclKey] = self[aclKey] || {};
            if (typeof ownerVal === 'string') {
                var newOwner = {};
                Object.keys(self[aclKey].owner).forEach(function (key) {
                    newOwner[ownerVal] = self[aclKey].owner[key];
                });
                self[aclKey].owner = newOwner;
            } else if (typeof ownerVal === 'object') {
                if (Object.keys(ownerVal).length !== 1) {
                    throw new Error('Invalid object while setting acl owner.');
                }
                self[aclKey].owner = ownerVal;
            }
        };

        // Instance method to change Group permissions
        schema.methods['chgrp'] = function (groupCode, perms) {
            this[aclKey] = this[aclKey] || {};
            if (groupCode) {
                this[aclKey].groups[groupCode] = perms;
            }
            this.markModified(aclKey + '.groups');
        };


        // // Instance method to change all permissions at once
        // // without changing Owner or Group
        // schema.methods['chmod'] = function(pubMode, ownerMode, groupMode) {
        // 	this[aclKey] = this[aclKey] || {};
        // 	if (pubMode !== undefined) {						console.log(key, obj[key]);
        // 						console.log(key, obj[key]);
        // }
        // 		this.markModified(aclKey + '.group');
        // 	}
        // };
        //
        // // Instance method to change all permissions at once
        // // without changing Owner or Group
        // schema.methods['chmod'] = function(pubMode, ownerMode, groupMode) {
        // 	this[aclKey] = this[aclKey] || {};
        // 	if (pubMode !== undefined) {						console.log(key, obj[key]);
        // console.log(key, obj[key]);

        // 	if (ownerMode !== undefined) {
        // 		this[aclKey].owner = this[aclKey].owner || {};
        // 		for (const owner of Object.keys(this[aclKey].owner)) {
        // 			this.chown(owner, ownerMode);
        // 		}
        // 	}
        // 	if (groupMode !== undefined) {
        // 		this[aclKey].group = this[aclKey].group || {};
        // 		for (const group of Object.keys(this[aclKey].group)) {
        // 			this.chown(group, groupMode);
        // 		}
        // 	}						console.log(key, obj[key]);

        // };
    };
}
