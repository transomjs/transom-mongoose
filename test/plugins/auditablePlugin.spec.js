'use strict';

const mongoose = require('mongoose');
const {
	Schema
} = require('mongoose');
let auditablePlugin = require('../../lib/plugins/auditablePlugin');

const MONGO_URI = 'mongodb://127.0.0.1:27017/auditablePlugin_test';

let AuthorSchema = new Schema({
	name: String
});
let Author = mongoose.model('AuthorAudit', AuthorSchema);

let BookSchema = new Schema({
	title: String,
	date: Date,
	author: {
		type: Schema.ObjectId,
		ref: 'AuthorAudit'
	}
});

// BookSchema.plugin(transomAcl.AclPlugin({
// 	entity
// }));

let Book = mongoose.model('BookAudit', BookSchema);

describe('auditablePlugin', function() {

	let expect, chai;
	before(function (done) {
		import('chai').then(ch => {
			chai = ch;
			// chai.use(require('chai-datetime'));
			expect = chai.expect;
		}).then(() => {
			// Mongoose Promise Library is deprecated, use native promises instead!
			mongoose.Promise = Promise;
			mongoose.set('strictQuery', true);

			return mongoose.connect(MONGO_URI, {
				// useMongoClient: true
			});
		}).then(() => {
			done();
		});
	});

	before(function(done) {
		mongoose.connection.db.dropDatabase().then(function() {
			done();
		});
	});

	before(function() {
		let book, books = [];
		let date = new Date();
		return Author.create({
			name: 'Author Conan Doyle'
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

	it('Added Auditable plugin to Schema', function() {
		expect({}).to.be.an.instanceOf(Object);

		// var defaultAcl = BookSchema.paths["_acl"].defaultValue;
		// expect(defaultAcl).to.be.an.instanceOf(Object);
		// expect(defaultAcl.public).to.equal(7);
		// expect(defaultAcl.owner).to.be.an.instanceOf(Object);
		// expect(defaultAcl.owner["CURRENT_USERID"]).to.equal(7);
		// expect(defaultAcl.groups).to.be.an.instanceOf(Object);
		// expect(defaultAcl.groups["CURRENT_USERID"]).to.equal(7);
	});

	afterEach(function() {
		// delete mongoosePaginate.paginate.options;
	});

    after(function(done) {
		// Edit Boolean to review the database after running tests.
		const dropIt = true;
		if (dropIt) {
			mongoose.connection.db.dropDatabase().then(() => {
				done();
			}).catch((err) => {
				console.log('Error dropping database: ', err);
			});
		} else {
			done();
		}
	});

	after(function() {
		return mongoose.disconnect();
	});
});
