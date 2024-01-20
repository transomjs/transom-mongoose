'use strict';

const mongoose = require('mongoose');
const {
	Schema
} = require('mongoose');
let expect = require('chai').expect;
let transomToCsv = require('../../lib/plugins/toCsvPlugin');

const MONGO_URI = 'mongodb://127.0.0.1:27017/toCsvPlugin_test';

let AuthorSchema = new Schema({
	name: String
});
let Author = mongoose.model('AuthorCsv', AuthorSchema);

let CoverSchema = new Schema({
	name: {
		type: String,
		order: 1000
	},
	isbn: String
});

let BookSchema = new Schema({
	code: String,
	title: {
		type: String,
		name: 'Book Title',
		order: 1000
	},
	never_to_csv: {
		type: String,
		csv: false
	},
	date: Date,
	// Include a ref-schema
	author: {
		type: Schema.ObjectId,
		ref: 'AuthorCsv',
		order: 2000
	},
	// Include a single-nested schema
	cover: CoverSchema
});

BookSchema.plugin(transomToCsv());

let Book = mongoose.model('BookCsv', BookSchema);

describe('transomToCsv', function () {

	before(function (done) {
		mongoose.Promise = Promise;
		mongoose.set('strictQuery', true);
		mongoose.connect(MONGO_URI, {
			// useMongoClient: true
			useNewUrlParser: true
		}, done);
	});

	before(function (done) {
		mongoose.connection.db.dropDatabase(done);
	});

	const books = [];

	before(function () {
		const titles = [
			"Faceoff",
			"Mr. Popper's Penguins",
			"Line\r\nBreak",
			"She's \"Gone\"",
			"Random Garbage"
		];

		let book = [];
		let date = new Date();
		return Author.create({
			name: 'Arthur Conan Doyle'
		}).then(function (author) {
			for (let i = 0; i < titles.length; i++) {
				book = new Book({
					code: `Book_${i}`,
					title: titles[i],
					date: new Date(date.getTime() + i),
					author: author._id,
					cover: {
						name: `Cover #${i}`,
						isbn: `00${i}.00${i}.00${i}`
					}
				});
				books.push(book);
			}
			return Book.create(books);
		});
	});

	afterEach(function () {
		// delete mongoosePaginate.paginate.options;
	});

	it('Added csv functions to Schema', function () {
		expect(BookSchema.statics.csvEscape).to.be.an.instanceOf(Function);

		const csvEscape = BookSchema.statics.csvEscape;
		expect(csvEscape(undefined)).to.equal('');
		expect(csvEscape('')).to.equal('');
		expect(csvEscape(``)).to.equal(``);
		expect(csvEscape(`Jim`)).to.equal(`"Jim"`);
		expect(csvEscape(true)).to.equal(`"true"`);
		expect(csvEscape('Has "quotes" around it...')).to.equal(`"Has ""quotes"" around it..."`);
		const dummyDate = new Date();
		expect(csvEscape(dummyDate)).to.equal(`"${dummyDate.toISOString()}"`);
		expect(csvEscape(`I'm\r\na small\rparagraph.`)).to.equal(`"I'm\na small\nparagraph."`);
	});

	it("Making csv Headers", function () {
		var Book = mongoose.model("BookCsv");
		Book.find({})
			.select('code title')
			.sort('code')
			.exec(function (err, books) {
				expect(err).to.be.null;

				const fields = ['code', 'title'];
				const csv = Book.csvHeaderRow(fields);

				expect(csv.header).to.equal(`"Code", "Book Title"\n`);
				const rows = [];
				books.map(function (book) {
					rows.push(book.csvDataRow(csv.fields));
				});
				expect(rows[0]).to.equal(`"Book_0", "Faceoff"\n`);
				expect(rows[1]).to.equal(`"Book_1", "Mr. Popper's Penguins"\n`);
				expect(rows[2]).to.equal(`"Book_2", "Line\nBreak"\n`);
				expect(rows[3]).to.equal(`"Book_3", "She's ""Gone"""\n`);
				expect(rows[4]).to.equal(`"Book_4", "Random Garbage"\n`);
			});
	});

	it("Making csv Headers with nesting", function () {
		var Book = mongoose.model("BookCsv");
		let error = null;
		const query = Book.find({})
			.sort('code')
			.populate('author');

		query.exec().then(function (books) {
			// query._fields is an empty Object at this point.
			// the net result is to output *all* the columns!
			const csv = Book.csvHeaderRow(query._fields);

			const rows = [];
			books.map(function (book) {
				rows.push(book.csvDataRow(csv.fields));
			});

			// Headers
			expect(csv.header).to.equal(`"Code", "Book Title", "Date", "Id", "Author Name", "Author  Id", "Cover Name", "Cover Isbn", "Cover  Id"\n`);

			// Data
			expect(rows[0]).to.equal(`"Book_0", "Faceoff", "${books[0].date.toISOString()}", "${books[0]._id.toString()}", "Arthur Conan Doyle", "${books[0]['author']['_id'].toString()}", "Cover #0", "000.000.000", "${books[0]['cover']['_id'].toString()}"\n`);
			expect(rows[1]).to.equal(`"Book_1", "Mr. Popper's Penguins", "${books[1].date.toISOString()}", "${books[1]._id.toString()}", "Arthur Conan Doyle", "${books[1]['author']['_id'].toString()}", "Cover #1", "001.001.001", "${books[1]['cover']['_id'].toString()}"\n`);
			expect(rows[2]).to.equal(`"Book_2", "Line\nBreak", "${books[2].date.toISOString()}", "${books[2]._id.toString()}", "Arthur Conan Doyle", "${books[2]['author']['_id'].toString()}", "Cover #2", "002.002.002", "${books[2]['cover']['_id'].toString()}"\n`);
			expect(rows[3]).to.equal(`"Book_3", "She's ""Gone""", "${books[3].date.toISOString()}", "${books[3]._id.toString()}", "Arthur Conan Doyle", "${books[3]['author']['_id'].toString()}", "Cover #3", "003.003.003", "${books[3]['cover']['_id'].toString()}"\n`);
			expect(rows[4]).to.equal(`"Book_4", "Random Garbage", "${books[4].date.toISOString()}", "${books[4]._id.toString()}", "Arthur Conan Doyle", "${books[4]['author']['_id'].toString()}", "Cover #4", "004.004.004", "${books[4]['cover']['_id'].toString()}"\n`);
		}).catch(function (err) {
			console.log(err);
			error = err;
		}).finally(function () {
			expect(error).to.be.null;
		});
	});

	it("Making csv Headers with nesting, and a subset of fields returned with .select()", function () {
		var Book = mongoose.model("BookCsv");
		var error = null;
		const query = Book.find({})
			.sort('code')
			.select('code title author.name');
			// .populate('author'); // Collision! author.name is already selected!

		query.exec().then(function (books) {
			// query._fields is an empty Object at this point.
			// The net result is to output *all* the columns!
			const csv = Book.csvHeaderRow(query._fields);

			// Headers
			expect(csv.header).to.equal(`"Code", "Book Title", "Author Name"\n`);
		}).catch(function (err) {
			console.log(err);
			error = err;
		}).finally(function () {
			expect(err).to.be.null;
		});
	});

	it("Making csv Headers with nesting and selected fields, in 'options.order'", function () {
		var Book = mongoose.model("BookCsv");
		let error = null;
		return Book.find({})
			.sort('code')
			.populate('author')
			.exec().then(function (books) {

				// Unsorted fields get sorted by their 'options.order' values.
				const unsortedFields = ['_id', 'code', 'title', 'author.name', 'cover.name'];
				const csv = Book.csvHeaderRow(unsortedFields);

				const rows = [];
				books.map(function (book) {
					rows.push(book.csvDataRow(csv.fields));
				});

				// Headers
				expect(csv.header).to.equal(`"Code", "Book Title", "Id", "Author Name", "Cover Name"\n`);

				// Data
				expect(rows[0]).to.equal(`"Book_0", "Faceoff", "${books[0]._id.toString()}", "Arthur Conan Doyle", "Cover #0"\n`);
				expect(rows[1]).to.equal(`"Book_1", "Mr. Popper's Penguins", "${books[1]._id.toString()}", "Arthur Conan Doyle", "Cover #1"\n`);
				expect(rows[2]).to.equal(`"Book_2", "Line\nBreak", "${books[2]._id.toString()}", "Arthur Conan Doyle", "Cover #2"\n`);
				expect(rows[3]).to.equal(`"Book_3", "She's ""Gone""", "${books[3]._id.toString()}", "Arthur Conan Doyle", "Cover #3"\n`);
				expect(rows[4]).to.equal(`"Book_4", "Random Garbage", "${books[4]._id.toString()}", "Arthur Conan Doyle", "Cover #4"\n`);
			}).catch(function (err) {
				console.log(err);
				error = err;
			}).finally(function () {
				expect(error).to.be.null;
			});
	});

	it("Making csv Headers with nesting and selected fields, in order as asked", function () {
		var Book = mongoose.model("BookCsv");
		let error = null;
		return Book.find({})
			.sort('code')
			.populate('author')
			.exec().then(function (books) {

				// Unsorted fields get sorted by their 'options.order' values.
				const unsortedFields = ['_id', 'code', 'title', 'author.name', 'cover.name'];
				const csv = Book.csvHeaderRow(unsortedFields, false);

				const rows = [];
				books.map(function (book) {
					rows.push(book.csvDataRow(csv.fields));
				});

				// Headers
				expect(csv.header).to.equal(`"Id", "Code", "Book Title", "Author Name", "Cover Name"\n`);

				// Data
				expect(rows[0]).to.equal(`"${books[0]._id.toString()}", "Book_0", "Faceoff", "Arthur Conan Doyle", "Cover #0"\n`);
				expect(rows[1]).to.equal(`"${books[1]._id.toString()}", "Book_1", "Mr. Popper's Penguins", "Arthur Conan Doyle", "Cover #1"\n`);
				expect(rows[2]).to.equal(`"${books[2]._id.toString()}", "Book_2", "Line\nBreak", "Arthur Conan Doyle", "Cover #2"\n`);
				expect(rows[3]).to.equal(`"${books[3]._id.toString()}", "Book_3", "She's ""Gone""", "Arthur Conan Doyle", "Cover #3"\n`);
				expect(rows[4]).to.equal(`"${books[4]._id.toString()}", "Book_4", "Random Garbage", "Arthur Conan Doyle", "Cover #4"\n`);
			}).catch(function (err) {
				console.log(err);
				error = err;
			}).finally(function () {
				expect(error).to.be.null;
			});
	});

	after(function (done) {
		// Edit Boolean to review the database after running tests.
		const dropIt = true;
		if (dropIt) {
			mongoose.connection.db.dropDatabase(done);
		} else {
			done();
		}
	});

	after(function (done) {
		mongoose.disconnect(done);
	});
});