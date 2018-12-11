'use strict';
const aclConstants = require('./aclConstants');
const { Schema } = require('mongoose');

/**
 * This is a Mongoose schema ACL plugin.
 * @param  {[type]} options [description]
 * @return {[type]} function [description]
 */
module.exports = function(options) {
  const INT_VALUE = aclConstants.INT_VALUE;
  const BITWISE_VALUE = aclConstants.BITWISE_VALUE;
  const CRUD_STRING = aclConstants.CRUD_STRING;
  const CURRENT_USER = aclConstants.CURRENT_USER;
  const READ_UPDATE_DELETE = INT_VALUE.READ | INT_VALUE.UPDATE | INT_VALUE.DELETE;

  const aclKey = options.aclKey || '_acl';
  const entityAcl = (options.entity ? options.entity.acl : undefined) || {};
  const defaultAclValue = entityAcl.default || {};

  const publik = defaultAclValue.public !== undefined ? defaultAclValue.public : READ_UPDATE_DELETE;
  const owner = defaultAclValue.owner
    ? defaultAclValue.owner
    : {
        CURRENT_USER: READ_UPDATE_DELETE
      };
  const groups = defaultAclValue.groups ? defaultAclValue.groups : {};

  const queryHasRead = {
    $bitsAnySet: [BITWISE_VALUE.READ]
  };
  const queryHasUpdate = {
    $bitsAnySet: [BITWISE_VALUE.UPDATE]
  };
  const queryHasDelete = {
    $bitsAnySet: [BITWISE_VALUE.DELETE]
  };

  const defaultAcl = {
    public: publik,
    owner,
    groups
  };

  return function(schema) {
    const customTypeKey = schema.options.typeKey;
    const aclType = {
      public: {
        required: true,
        default: publik
      },
      owner: {
        required: true,
        default: owner
      },
      groups: {
        required: true,
        default: groups
      }
    };
    aclType.public[customTypeKey] = Number;
    aclType.owner[customTypeKey] = Schema.Types.Mixed;
    aclType.groups[customTypeKey] = Schema.Types.Mixed;

    const field = {};
    field[aclKey] = {
      default: defaultAcl,
      required: true,
      csv: false
    };
    field[aclKey][customTypeKey] = aclType;
    schema.add(field);

    schema.statics.aclQuery = function(req) {
      let aclAction;
      const aclOperation = req.locals.acl || 'NONE';
      switch (aclOperation) {
        case CRUD_STRING.UPDATE:
          aclAction = queryHasUpdate;
          break;
        case CRUD_STRING.DELETE:
          aclAction = queryHasDelete;
          break;
        case CRUD_STRING.READ:
          aclAction = queryHasRead;
          break;
        default:
          aclAction = BITWISE_VALUE.NIL; // Will affect no rows.
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
    };

    schema.options.aclKey = aclKey;

    schema.statics.getGroupsWithAclCreate = function() {
      // Return an Array of groups required to CREATE a record.
      let groups = entityAcl.create || [];
      if (typeof groups === 'string') {
        groups = [groups];
      }
      return groups;
    };

    schema.statics.hasGroup = function(req, groups) {
      if (groups.length === 0) {
        // Allow if there aren't any Groups.
        return true;
      }
      if (req.locals.user) {
        const userGroups = req.locals.user.groups || [];
        for (let group of groups) {
          if (userGroups.indexOf(group) !== -1) {
            return true;
          }
        }
      }
      return false;
    };

    schema.statics.setAclDefaults = function(req) {
      var model = this;
      if (model.isNew && model[aclKey]) {
        // Default _acl values are provided in the Schema.
        // Replace Owner & Group defaults of CURRENT_USER with the actual UserId.
        const props = ['owner', 'groups'];
        props.forEach(function(prop) {
          const aclProp = model[aclKey][prop];
          if (aclProp && aclProp.hasOwnProperty(CURRENT_USER)) {
            // Copy the value & delete the key.
            aclProp[req.locals.user._id] = aclProp[CURRENT_USER];
            delete aclProp[CURRENT_USER];
          }
        });
      }
    };

    // http://mongoosejs.com/docs/guide.html#query-helpers
    schema.query.aclCheck = function(aclOperation, req) {
      if (
        aclOperation === CRUD_STRING.READ ||
        aclOperation === CRUD_STRING.UPDATE ||
        aclOperation === CRUD_STRING.DELETE
      ) {
        req.locals.acl = aclOperation;
        const aclQuery = schema.statics.aclQuery(req);
        return this.and(aclQuery);
      }
      throw new Error(`Unhandled ACL check: ${aclOperation}`);
    };

    schema.methods.aclCreate = function(req) {
      const groups = schema.statics.getGroupsWithAclCreate();
      if (!schema.statics.hasGroup.call(this, req, groups)) {
        throw new Error(`Failed ACL check on ${CRUD_STRING.CREATE}, requires one of [${groups.join(',')}] groups.`);
      }
      return schema.statics.setAclDefaults.call(this, req);
    };

    schema.query.aclRead = function(req) {
      return schema.query.aclCheck.call(this, CRUD_STRING.READ, req);
    };

    schema.query.aclWrite = function(req) {
      return schema.query.aclCheck.call(this, CRUD_STRING.UPDATE, req);
    };

    schema.query.aclDelete = function(req) {
      return schema.query.aclCheck.call(this, CRUD_STRING.DELETE, req);
    };

    // Instance method to change Owner.
    schema.methods.chown = function(ownerVal) {
      this[aclKey] = this[aclKey] || {};
      if (typeof ownerVal === 'string') {
        // Copy existing owner permissions to the new owner ObjectId key.
        const newOwner = {};
        Object.keys(this[aclKey].owner).forEach(key => {
          newOwner[ownerVal] = this[aclKey].owner[key];
        });
        this[aclKey].owner = newOwner;
      } else if (typeof ownerVal === 'object') {
        if (Object.keys(ownerVal).length !== 1) {
          throw new Error('Invalid object while setting acl owner, expecting {user._id: perms}.');
        }
        this[aclKey].owner = ownerVal;
      }
    };

    // Instance method to add or change Group permissions
    schema.methods.chgrp = function(group, perms) {
      this[aclKey] = this[aclKey] || {};
      if (group) {
        this[aclKey].groups[group] = perms;
      }
      this.markModified(`${aclKey}.groups`);
    };

    // // Instance method to change all permissions at once
    // // without changing Owner or Group
    // schema.methods['chmod'] = function(pubMode, ownerMode, groupMode) {
    // 	    this[aclKey] = this[aclKey] || {};
    // 	    if (pubMode !== undefined) {
    //          console.log(key, obj[key]);
    //      }
    // 		this.markModified(aclKey + '.group');
    // 	    }
    // };
    //
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
    // 	}

    // };
  };
};
