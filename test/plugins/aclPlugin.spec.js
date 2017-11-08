'use strict';

const mongoose = require('mongoose');
const {
	Schema
} = require('mongoose');
let expect = require('chai').expect;
let transomAcl = require('../../../transom-mongoose/plugins/aclPlugin');

const MONGO_URI = 'mongodb://127.0.0.1/aclPlugin_test';

let AuthorSchema = new Schema({
	name: String
});
let Author = mongoose.model('Author', AuthorSchema);

let BookSchema = new Schema({
	title: String,
	date: Date,
	author: {
		type: Schema.ObjectId,
		ref: 'Author'
	}
});

const entity = {
	acl: {
		"xcreate": ["public", "admin", "agents", "hillbilly"],
		"xdefault": {
			"public": 2,
			"owner": {
				"CURRENT_USERID": 4
			}, // Defaults to: {"CURRENT_USER": 7}
			"xgroup": {
				"agents": 6
			}
		}
	}
};
BookSchema.plugin(transomAcl.AclPlugin({
	entity
}));

let Book = mongoose.model('Book', BookSchema);

describe('aclPlugin', function() {

	before(function(done) {
		// Mongoose Promise Library is deprecated, use native promises instead!
		mongoose.Promise = Promise;

		mongoose.connect(MONGO_URI, {
			useMongoClient: true
		}, done);
	});

	before(function(done) {
		mongoose.connection.db.dropDatabase(done);
	});

	before(function() {
		let book, books = [];
		let date = new Date();
		return Author.create({
			name: 'Arthur Conan Doyle'
		}).then(function(author) {
			for (let i = 1; i <= 100; i++) {
				book = new Book({
					title: 'Book #' + i,
					date: new Date(date.getTime() + i),
					author: author._id
				});
				books.push(book);
			}
			return Book.create(books);
		});
	});

	afterEach(function() {
		// delete mongoosePaginate.paginate.options;
	});

	it('Added default ACL to Schema', function() {
		expect(BookSchema.paths["_acl"]).to.be.an.instanceOf(Object);

		var defaultAcl = BookSchema.paths["_acl"].defaultValue;
		expect(defaultAcl).to.be.an.instanceOf(Object);
		expect(defaultAcl.public).to.equal(7);
		expect(defaultAcl.owner).to.be.an.instanceOf(Object);
		expect(defaultAcl.owner["CURRENT_USERID"]).to.equal(7);
		expect(defaultAcl.groups).to.be.an.instanceOf(Object);
		expect(defaultAcl.groups).to.deep.equal({});
	});

	it('Added custom ACL to Schema', function() {
		const entity = {
			acl: {
				default: {
					"public": 0,
					"owner": {
						"FooBar": 7
					},
					"groups": {
						"BarBaz": 2
					}
				}
			}
		};

		let dummySchema = new Schema({
			name: String
		}).plugin(transomAcl.AclPlugin({
			entity
		}));

		var defaultAcl = dummySchema.paths["_acl"].defaultValue;

		expect(defaultAcl).to.be.an.instanceOf(Object);
		expect(defaultAcl.public).to.equal(0);
		expect(defaultAcl.owner).to.be.an.instanceOf(Object);
		expect(defaultAcl.owner).to.have.property("FooBar").and.equal(7);
		expect(defaultAcl.groups).to.be.an.instanceOf(Object);
		expect(defaultAcl.groups).to.have.property("BarBaz").and.equal(2);
	});

	it('returns a plugin instance', function() {
		var plugin = transomAcl.AclPlugin({
			entity
		});


		// newSchema.plugin(transomAcl.AclPlugin({mongoose, acl: entity.acl}));
		//
		// let promise = Book.paginate();
		expect(plugin).to.be.an.instanceof(Function);

		// console.log(BookSchema.paths["_acl"]);
		// expect(null).to.be.null;
	});

	describe('static methods', function() {
		// it('adds a static constants function', function() {
		// 	let dummySchema = new mongoose.Schema({
		// 		name: String
		// 	}).plugin(transomAcl.AclPlugin({
		// 		mongoose,
		// 		acl
		// 	}));
		//
		// 	expect(dummySchema.statics.aclConstants).to.be.an.instanceof(Function);
		// 	const aclConstants = dummySchema.statics.aclConstants();
		//
		// 	expect(aclConstants.READ).to.be.a("string").and.to.equal("READ");
		// 	expect(aclConstants.UPDATE).to.be.a("string").and.to.equal("UPDATE");
		// 	expect(aclConstants.DELETE).to.be.a("string").and.to.equal("DELETE");
		// });
		it('adds a setAclDefaults static method.', function() {
			let dummySchema = new Schema({
				name: String
			}).plugin(transomAcl.AclPlugin({
				entity
			}));

			expect(dummySchema.statics.setAclDefaults).to.be.an.instanceof(Function);
			// ... more tests?
		});

		it('adds a static aclQuery function', function() {
			let dummySchema = new Schema({
				name: String
			}).plugin(transomAcl.AclPlugin({
				entity
			}));

			expect(dummySchema.statics.aclQuery).to.be.an.instanceof(Function);

			var req = {
				locals: {
					user: {
						_id: "foobarbaz",
						groups: ["horse", "cow", "dinosaur"]
					},
					acl: "READ"
				}
			};
			var result = dummySchema.statics.aclQuery(req);
			expect(result).to.have.property("$or").and.to.be.an("array");
			expect(result["$or"]).to.deep.include({
				"_acl.public": {
					"$bitsAnySet": [0] // BITWISE_READ
				}
			});
			expect(result["$or"]).to.deep.include({
				"_acl.owner.foobarbaz": {
					"$bitsAnySet": [0] // BITWISE_READ
				}
			});
			// Groups are just added to the $or[].
			expect(result["$or"]).to.deep.include({
				"_acl.groups.horse": {
					"$bitsAnySet": [0] // BITWISE_READ
				}
			});
			expect(result["$or"]).to.deep.include({
				"_acl.groups.cow": {
					"$bitsAnySet": [0] // BITWISE_READ
				}
			});
			expect(result["$or"]).to.deep.include({
				"_acl.groups.dinosaur": {
					"$bitsAnySet": [0] // BITWISE_READ
				}
			});
			expect(result["$or"]).to.have.length(5);
		});
	});

	describe('instance methods', function() {


		it('adds a chown instance method, using Object or String arg.', function() {
			let dummySchema = new Schema({
				name: String
			}).plugin(transomAcl.AclPlugin({
				entity
			}));

			expect(dummySchema.methods.chown).to.be.an.instanceof(Function);

			var fakeInstance = {
				name: "I'm a fake",
				_acl: {
					public: 3,
					owner: {
						"jim": 7
					},
					group: {
						"notused": 0
					}
				},
				dirtyFields: [],
				markModified: function(val) {
					this.dirtyFields.push(val);
				}
			};

			// replace owner with Object.
			var newOwner = {
				"foobar": 5
			};
			dummySchema.methods.chown.call(fakeInstance, newOwner);
			expect(fakeInstance._acl.owner).to.have.property("foobar").and.equal(5);

			// replace owner with String.
			dummySchema.methods.chown.call(fakeInstance, "foo-string");
			expect(fakeInstance._acl.owner).to.have.property("foo-string").and.equal(5);
		});

	});

	after(function(done) {
		// Edit Boolean to review the database after running tests.
		const dropIt = true;
		if (dropIt) {
			mongoose.connection.db.dropDatabase(done);
		} else {
			done();
		}
	});

	after(function(done) {
		mongoose.disconnect(done);
	});
});
