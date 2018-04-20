module.exports = function (options) {
	// no init necessary at this point.
	return function (schema, options) {
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
			user = user ? user : "Undefined";
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
					return next(new Error("Model instance requires setting 'modifiedBy' before calling save()."));
				}
			} else {
				this.modifiedBy = defaultModifiedBy;
			}
			next();
		});

		schema.pre('update', function (next) {
			const setValues = {};
			if (requireModifiedBy) {
				if (!this.model.modifiedBy) {
					return next(new Error("Model object requires setting 'modifiedBy' before calling update()."));
				}
				const user = this.model.modifiedBy;
				this.__currentUser = user;
				setValues[updatedBy] = (typeof user === 'string' ? user : user.email);
			} else {
				setValues[updatedBy] = defaultModifiedBy;
			}
			// Add audit user to the query before firing the update
			this.update({}, { $set: setValues }, {overwrite: false});
			next();
		});
	}
};