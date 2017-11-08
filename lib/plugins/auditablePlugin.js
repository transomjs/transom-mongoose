module.exports = function (schema, options) {
	options = options || {};

	const requireModifiedBy = (options.requireModifiedBy === undefined ? true : options.requireModifiedBy);
	const defaultModifiedBy = options.defaultModifiedBy || 'auditable-plugin';
	const createdBy = options.createdBy || "created_by";
	const updatedBy = options.updatedBy || "updated_by";

	const createdField = {};
	createdField[createdBy] = {
		type: String
	};
	schema.add(createdField);

	const updatedField = {};
	updatedField[updatedBy] = {
		type: String
	};
	schema.add(updatedField);

	// Create a ModifiedBy virtual that won't end up in a csv export.
	const modifiedBy = schema.virtual('modifiedBy', {
		csv: false
	});
	modifiedBy.set(function (user) {
		this.__currentUser = user;
		this[updatedBy] = (typeof user === 'string' ? user : user.email);
		if (this.isNew || !this["_id"]) {
			this[createdBy] = this[updatedBy];
		}
	});
	modifiedBy.get(function () {
		return undefined;
	});

	schema.pre('save', function (next) {
		if (requireModifiedBy) {
			if (!this.__currentUser) {
				return next(new Error("Model object requires setting 'modifiedBy' before calling save()."));
			}
		} else {
			this.modifiedBy = defaultModifiedBy;
		}
		next();
	});

	schema.pre('update', function(next) {
		if (requireModifiedBy) {
			if (!this.__currentUser) {
				return next(new Error("Model object requires setting 'modifiedBy' before calling update()."));
			}
		} else {
			this.modifiedBy = defaultModifiedBy;
		}
		next();
	});
};