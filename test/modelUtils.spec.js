'use strict';

const {
	Schema
} = require('mongoose');
const chai = require('chai');
chai.use(require('chai-datetime'));
const expect = chai.expect;

const modelUtils = require('../lib/modelUtils');

describe('modelUtils', function() {

	// Today
	const today = new Date();
	const TODAY_DATE = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));

	before(function(done) {
		done();
	});

	afterEach(function() {
		// delete mongoosePaginate.paginate.options;
	});

	it('modelUtils is an Object', function() {
		expect(modelUtils).to.be.an.instanceOf(Object);
	});

	it('toTitleCase', function() {
		expect(modelUtils.toTitleCase("foo_bar")).to.be.equal("Foo Bar");
		expect(modelUtils.toTitleCase("foo bar")).to.be.equal("Foo Bar");
		expect(modelUtils.toTitleCase("foo-bar")).to.be.equal("Foo-bar");
		expect(modelUtils.toTitleCase("foobar")).to.be.equal("Foobar");
		expect(modelUtils.toTitleCase("_foo bar ")).to.be.equal("Foo Bar");
		expect(modelUtils.toTitleCase("   foo bar  ")).to.be.equal("Foo Bar");
	});

	it('createDefault, should convert known string values to data', function(done) {
		// Digit as Number
		var def = modelUtils.createDefault({
			type: 'number',
			default: '234'
		});
		expect(def).to.be.an.instanceOf(Function);
		expect(def()).to.be.equal(234);

		// Digit as String
		def = modelUtils.createDefault({
			default: '456'
		});
		expect(def).to.be.an.instanceOf(Function);
		expect(def()).to.be.equal("456");

		// True as Boolean
		def = modelUtils.createDefault({
			type: 'boolean',
			default: 'TRUE'
		});
		expect(def).to.be.an.instanceOf(Function);
		expect(def()).to.be.equal(true);

		// True as String, It's just a string & not affected!!
		def = modelUtils.createDefault({
			type: 'string',
			default: 'TruE'
		});
		expect(def).to.be.an.instanceOf(Function);
		expect(def()).to.be.equal('TruE');

		// False as Boolean
		def = modelUtils.createDefault({
			type: 'boolean',
			default: 'faLse'
		});
		expect(def).to.be.an.instanceOf(Function);
		expect(def()).to.be.equal(false);

		// Boolean with garbage input
		def = modelUtils.createDefault({
			code: 'horse',
			type: 'boolean',
			default: 'invalid'
		});
		expect(def).to.be.undefined;

		// Fallback to returning input on bad datatype
		def = modelUtils.createDefault({
			type: 'garbage',
			default: 'foobarbaz'
		});
		expect(def).to.be.an.instanceOf(Function);
		expect(def()).to.be.equal("foobarbaz");

		def = modelUtils.createDefault({
			type: 'date',
			default: 'TOdAY'
		});
		expect(def).to.be.undefined;

		// Now, make sure that it re-evaluates each time. These should be close!
		var now = new Date();
		now = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
			now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
		var nowSeconds = Math.round(now.getTime() / 1000);

		def = modelUtils.createDefault({
			type: 'date',
			default: 'Now'
		});
		expect(def).to.be.an.instanceOf(Function);
		var defSeconds = Math.round(def().getTime() / 1000);
		// console.log(defSeconds, nowSeconds);
		expect(defSeconds).to.be.equal(nowSeconds);
		// expect(def()).to.be.withinDate(now, 2);

		// Make sure Now doesn't reply with the same thing each time!
		var defNow = def();
		setTimeout(function() {
			var nowButLater = modelUtils.createDefault({
				type: 'date',
				default: 'NOw'
			})();
			expect(defNow.getTime()).to.be.at.most(nowButLater.getTime());
			// console.log(defNow.getTime(), nowButLater.getTime());
			expect(defNow.getTime()).to.be.not.equal(nowButLater.getTime());

			// And call done()!!
			done();
		}, 10);
	});

	it('mapToSchemaType, should convert API field type to Mongoose datatypes', function() {
		var result;
		result = modelUtils.mapToSchemaType('objectid');
		expect(result).to.have.property("type").and.to.equal(Schema.Types.ObjectId);
		expect(Object.keys(result).length).to.equal(1, "mapToSchemaType output has extra properties");
		//
		result = modelUtils.mapToSchemaType('connector');
		expect(result).to.have.property("type").and.to.equal(Schema.Types.ObjectId);
		expect(Object.keys(result).length).to.equal(1, "mapToSchemaType output has extra properties");
		//
		result = modelUtils.mapToSchemaType('binary');
		expect(result).to.have.property("paths");
		expect(result).to.have.property("obj");
		expect(result.obj).to.have.property("binaryData");
		expect(result.obj.binaryData).to.have.property("type").and.to.equal('buffer');
		expect(result.obj).to.have.property("filename");
		expect(result.obj.filename).to.have.property("type").and.to.equal('string');
		expect(result.obj).to.have.property("mimetype");
		expect(result.obj.mimetype).to.have.property("type").and.to.equal('string');
		expect(result.obj).to.have.property("size");
		expect(result.obj.size).to.have.property("type").and.to.equal('number');
		expect(Object.keys(result.obj).length).to.equal(4, "mapToSchemaType output has extra properties");
		//
		result = modelUtils.mapToSchemaType('Fluffy');
		expect(result).to.have.property("type").and.to.equal("Fluffy");
		expect(Object.keys(result).length).to.equal(1, "mapToSchemaType output has extra properties");
		//
		result = modelUtils.mapToSchemaType(null);
		expect(result).to.have.property("type").and.to.equal("string");
		expect(Object.keys(result).length).to.equal(1, "mapToSchemaType output has extra properties");
	});

	// it('csvEscape, should cleanup field values for output to CSV files', function() {
	// 	var csvEsc = modelUtils.csvEscape();
	// 	expect(csvEsc).to.be.an.instanceOf(Function);
	// 	expect(csvEsc('foo')).to.equal(`"foo"`);
	// 	expect(csvEsc('123')).to.equal(`"123"`);
	// 	expect(csvEsc(' foo ')).to.equal(`" foo "`);
	// 	expect(csvEsc('')).to.equal('');
	// 	expect(csvEsc(true)).to.equal(`"true"`);
	// 	expect(csvEsc('foo\r\nbar')).to.equal(`"foo\nbar"`);
	// 	const now = new Date();
	// 	expect(csvEsc(now)).to.equal(now.toISOString());
	// 	expect(csvEsc(undefined)).to.equal('');
	// });
	//
	it('parseUserQueryString', function() {
		expect(modelUtils.parseUserQueryString()).to.deep.equal({});
		expect(modelUtils.parseUserQueryString("=foo")).to.deep.equal({});
		expect(modelUtils.parseUserQueryString("")).to.deep.equal({});
		// With properties...
		expect(modelUtils.parseUserQueryString("foo=123&bar=red&bar=blue")).to.deep.equal({
			foo: '123',
			bar: ['red', 'blue']
		});
		expect(modelUtils.parseUserQueryString("foo=&bar=orange&bar=blue")).to.deep.equal({
			foo: '',
			bar: ['orange', 'blue']
		});
	});

	xit('customError', function() {

	});

	it('cleanJson', function() {
		const fakeSchema = {
			options: {
				versionKey: '__v'
			}
		};
		const doc = {
			_reverse: {
				animal: 'horse',
				vehicle: 'spaceship',
				price: 123.45
			}
		};
		const ret = {
			_id: '0123456789',
			zero: 0,
			one: 'One hundred',
			two: 200,
			three: 300
		};
		const options = undefined; // not used.

		// Generate the closure with a columns array.
		const cleanFunc = modelUtils.cleanJson(fakeSchema);
		expect(cleanFunc).to.be.an.instanceOf(Function);

		// Try it with documents.
		const cleaned = cleanFunc(doc, ret, options);
		expect(cleaned).to.have.property('_id').and.to.equal('0123456789');
		expect(cleaned).to.have.property('one').and.to.equal('One hundred');
		expect(cleaned).to.have.property('three').and.to.equal(300);
		expect(cleaned).to.have.property('animal').and.to.equal('horse');
		expect(cleaned).to.have.property('vehicle').and.to.equal('spaceship');
		expect(cleaned).to.have.property('price').and.to.equal(123.45);
		expect(Object.keys(cleaned).length).to.equal(8, "cleanJson output has extra properties");
	});

	it('constantsFunction', function() {
		const constantsFunc = modelUtils.constantsFunction();

		const asBoolean = {
			options: {
				type: 'boolean'
			}
		};
		const asString = {
			options: {
				type: 'string'
			}
		};
		const asDate = {
			options: {
				type: 'date'
			}
		};

		const dummy = {
			schema: {
				paths: {
					isRed: asBoolean,
					isBlue: asBoolean,
					chkNull: {
						options: {
							type: 'not checked on NULL'
						}
					},
					chkTodayDate: asDate,
					chkNowDate: asDate,
					chkTodayString: asString,
					chkNowString: asString,
					chkUsername: asString,
					chkUserId: asString
				}
			},
			isRed: 'TRUE',
			isBlue: 'FALSE',
			chkNull: 'NULL',
			chkTodayDate: 'TODAY',
			chkTodayString: 'TODAY',
			chkNowDate: 'NOW',
			chkNowString: 'NOW',
			chkUsername: 'CURRENT_USERNAME',
			chkUserId: 'CURRENT_USERID',
			blue: 'Good morning!' // Not a constant.
		};
		const options = {
			user: {
				_id: '0123456789',
				username: 'parkerp',
				email: 'spiderman63@hobomail.xyz'
			}
		}

		function toUtcDate(def) {
			return new Date(Date.UTC(def.getUTCFullYear(), def.getUTCMonth(), def.getUTCDate(),
									def.getUTCHours(), def.getUTCMinutes(), def.getUTCSeconds(), def.getUTCMilliseconds()));
		}
		const beforeUtcDate = toUtcDate(new Date());

		constantsFunc.call(dummy, options);

		const afterUtcDate = toUtcDate(new Date());

		expect(dummy).to.have.property('isRed').and.to.equal(true);
		expect(dummy).to.have.property('isBlue').and.to.equal(false);
		expect(dummy).to.have.property('chkNull').and.to.be.null;

		expect(dummy).to.have.property('chkNowDate').and.to.be.withinDate(beforeUtcDate, afterUtcDate);
		expect(new Date(dummy['chkNowString'])).to.be.withinDate(beforeUtcDate, afterUtcDate);

		expect(dummy).to.have.property('chkUsername').and.to.equal(options.user.username);
		expect(dummy).to.have.property('chkUserId').and.to.equal(options.user._id);
		expect(dummy).to.have.property('blue').and.to.equal('Good morning!');

		// Test fallback to email address.
		const options2 = {
			user: {
				_id: '123456789',
				username: undefined,
				email: 'spiderman63@hobomail.xyz'
			}
		}
		dummy['chkUsername'] = 'CURRENT_USERNAME';
		constantsFunc.call(dummy, options2);
		expect(dummy).to.have.property('chkUsername').and.to.equal(options2.user.email);
	});

	after(function(done) {
		//mongoose.connection.db.dropDatabase(done);
		done();
	});

	after(function(done) {
		// mongoose.disconnect(done);
		done();
	});
});
