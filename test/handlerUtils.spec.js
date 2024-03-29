'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const restifyErrors = require('restify-errors');
// const chai = require('chai');
// chai.use(require('chai-datetime'));
// const expect = chai.expect;

const HandlerUtils = require('../lib/handlerUtils');
const { after } = require('mocha');

describe('handlerUtils', function () {

	const MONGO_URI = 'mongodb://127.0.0.1:27017/handlerUtils_test';
	let chai;
	let expect;
	
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


	afterEach(function () {
		// delete mongoosePaginate.paginate.options;
	});

	it('handlerUtils is an Object', function () {
		const handlerUtils = new HandlerUtils();
		expect(handlerUtils).to.be.an.instanceOf(Object);
	});

	it('can parse Stringified JSON Objects', function () {
		const handlerUtils = new HandlerUtils();
		const sample = `{"coordinates":[108.258,181.368],"type":"Point"}`;
		const result = handlerUtils.tryParseJSON(sample, 'not-used');
		expect(result).to.be.an.instanceOf(Object);
		expect(result).to.have.property('type').and.to.equal("Point");
		expect(result).to.have.property('coordinates').and.to.be.an.instanceof(Array);
		expect(result.coordinates).to.have.members([108.258, 181.368]);
		expect(result.coordinates.length).to.equal(2, "tryParseJSON returned extra array members");
	});

	it('can parse Stringified JSON Array', function () {
		const handlerUtils = new HandlerUtils();
		const sample = `["108.258","181.368","Mickey Mouse"]`;
		const result = handlerUtils.tryParseJSON(sample, 'not-used');
		expect(result).to.be.an.instanceOf(Array);
		expect(result).to.have.members(["108.258", "181.368", "Mickey Mouse"]);
		expect(result.length).to.equal(3, "tryParseJSON returned extra array members");
	});

	it('can skip parsing Objects', function () {
		const handlerUtils = new HandlerUtils();
		const sample = { coordinates: [213.685, 181.368], type: 'Bark-Bark' };
		const result = handlerUtils.tryParseJSON(sample, 'not-used');
		expect(result).to.be.an.instanceOf(Object);
		expect(result).to.have.property('type').and.to.equal("Bark-Bark");
		expect(result).to.have.property('coordinates').and.to.be.an.instanceof(Array);
		expect(result.coordinates).to.have.members([213.685, 181.368]);
		expect(result.coordinates.length).to.equal(2, "tryParseJSON returned extra array members");
	});

	it('can throw errors on invalid JSON', function () {
		const handlerUtils = new HandlerUtils();
		const invalidSample = `{ INVALID JSON! }`;
			expect(() => {
				handlerUtils.tryParseJSON(invalidSample, 'testKey');
			}).to.throw("Failed to parse JSON value for 'testKey'.");
	});

	it('separate Api Operations from the request query parameters', function () {
		const reqQuery = {
			_skip: 12,
			_collation: 'default',
			_limit: 34,
			_sort: 'foobar',
			_populate: 'baz',
			_select: 'barbaz',
			_connect: 'bar',
			_keywords: 'foobaz',
			_type: 'json',
			address: '123 Here Street',
			city: 'Victoria',
			postal: 'ABC 123',
			_garbage: '*JU7ho8987!-a'
		};
		const fakeModel = {
			schema: {
				paths: {
					'address': {},
					'city': {},
					'postal': {},
				}
			}
		};
		const handlerUtils = new HandlerUtils();
		const result = handlerUtils.separateApiOperations(reqQuery, fakeModel);


		expect(result).to.be.an.instanceof(Object);
		expect(result.operands).to.be.an.instanceof(Object);
		expect(result.attributes).to.be.an.instanceof(Object);
		expect(result.extras).to.be.an.instanceof(Object);
		// Operators
		expect(Object.keys(handlerUtils.OPERANDS).length).to.equal(9, 'handlerUtils.OPERANDS has unexpected ');
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._skip).and.to.equal(reqQuery._skip);
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._collation).and.to.equal(reqQuery._collation);
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._limit).and.to.equal(reqQuery._limit);
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._sort).and.to.equal(reqQuery._sort);
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._populate).and.to.equal(reqQuery._populate);
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._select).and.to.equal(reqQuery._select);
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._connect).and.to.equal(reqQuery._connect);
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._keywords).and.to.equal(reqQuery._keywords);
		expect(result.operands).to.have.property(handlerUtils.OPERANDS._type).and.to.equal(reqQuery._type);
		expect(Object.keys(result.operands).length).to.equal(9, "separateApiOperations didn't test all possible operands");
		expect(Object.keys(handlerUtils.OPERANDS).length).to.equal(9, "handlerUtils.OPERANDS has been changed");
		// Attributes
		expect(result.attributes).to.have.property('address').and.to.equal(reqQuery.address);
		expect(result.attributes).to.have.property('city').and.to.equal(reqQuery.city);
		expect(result.attributes).to.have.property('postal').and.to.equal(reqQuery.postal);
		expect(Object.keys(result.attributes).length).to.equal(3, "separateApiOperations found extra attributes");
		// Other stuff that doesn't map.
		expect(result.extras).to.have.property('_garbage').and.to.equal(reqQuery._garbage);
	});

	it('processSelectOperator builds a valid mongoose select object', function () {
		const fakeModel = {
			schema: {
				options: {
					versionKey: '__v'
				},
				paths: {
					'address': {},
					'city': {},
					'postal': {},
				}
			}
		};
		const select = 'city,postal,customer._id';
		const handlerUtils = new HandlerUtils();
		const result = handlerUtils.processSelectOperator(fakeModel, select);
		expect(result.applyRoot).to.equal(true);
		expect(result.root).to.have.property('city').and.to.equal(1);
		expect(result.root).to.have.property('postal').and.to.equal(1);
		expect(result).to.have.property('customer').and.to.be.an.instanceof(Array);
		expect(result.customer).to.have.members(['_id']);
		expect(Object.keys(result.root).length).to.equal(2, "processSelectOperator found extra attributes");
	});

	it('processSelectOperator builds a complete(dynamic) mongoose select object', function () {
		const fakeModel = {
			schema: {
				options: {
					versionKey: '__version',
					typeKey: '$goofballTypeKey'
				},
				paths: {
					'address': {
						options: {}
					},
					'city': {
						options: {}
					},
					'postal': {
						options: {}
					},
					'photo': {
						options: {} // Set typeKey to binary below.
					},
					'__version': {
						options: {}
					}
				},
				path: function (key) {
					return this.paths[key];
				}
			}
		};
		const testTypeKey = fakeModel.schema.options.typeKey;
		fakeModel.schema.paths.photo.options[testTypeKey] = { __type: 'binary'};

		const select = null;
		const handlerUtils = new HandlerUtils();
		const result = handlerUtils.processSelectOperator(fakeModel, select);
		expect(result.applyRoot).to.equal(true);
		expect(result.root).to.have.property('address').and.to.equal(1);
		expect(result.root).to.have.property('city').and.to.equal(1);
		expect(result.root).to.have.property('postal').and.to.equal(1);
		expect(result.root).to.have.property('photo.filename').and.to.equal(1);
		expect(result.root).to.have.property('photo.mimetype').and.to.equal(1);
		expect(result.root).to.have.property('photo.size').and.to.equal(1);
		expect(Object.keys(result.root).length).to.equal(6, "processSelectOperator found extra attributes");
	});


	// http://localhost:8000/api/v1/db/person?_connect=billingaddress&_connect=shippingaddress&_select=firstname,lastname,billingaddress.address1,mailingaddress.address1&access_token=

	// http://localhost:8000/api/v1/db/person
	// ?_connect=billingaddress&_connect=shippingaddress
	// &_select=firstname,lastname,billingaddress.address1,mailingaddress.address1
	// &access_token=
	// NWIxMGYxODUtNmU1YS00NzkxLWJhZGUtZmUwYzViNDdjYWU4
	describe('processConnectOperator', function () {

		before(function () {
			const PersonSchema = new Schema({
				name: String,
				shippingaddress: {
					type: Schema.Types.ObjectId,
					ref: 'test-address'
				},
				billingaddress: {
					type: Schema.Types.ObjectId,
					ref: 'test-address'
				}
			});
			mongoose.model('test-person', PersonSchema);

			const AddressSchema = new Schema({
				address1: String,
				city: String
			});
			mongoose.model('test-address', AddressSchema);
		});

		it('should build an appropriate populateRegular object', function () {
			const personModel = mongoose.model('test-person');
			const addressModel = mongoose.model('test-address');
			const operations = {
				_select: "name,billingaddress.address1,shippingaddress.address1",
				_connect: ["billingaddress", "shippingaddress"]
			};
			const query = {};
			const selectOpts = {
				root: {
					firstname: 1,
					lastname: 1,
					"billingaddress.address1": 1,
					"shippingaddress.address": 1
				},
				applyRoot: true
			};
			const options = {
				// mongoose,
				query,
				operations,
				entity: {
					model: personModel,
					modelPrefix: 'test-',
					modelName: 'test-person'
				},
				selectOpts
			};
			const handlerUtils = new HandlerUtils({modelPrefix: 'test-'});
			const result = handlerUtils.processConnectOperator(options);

			expect(result).to.be.an.instanceof(Object);
			expect(result).to.have.property('populateRegular');
			expect(result.populateRegular).to.have.length(2);
			expect(result.populateRegular[0]).to.have.property('path').equal('billingaddress');
			expect(result.populateRegular[1]).to.have.property('path').equal('shippingaddress');
			//
			expect(result).to.have.property('populateReverse');
			expect(result.populateReverse).to.have.length(0);
			//
			expect(result).to.have.property('rootSelect');
			expect(result.rootSelect).to.have.length(2);
			expect(result.rootSelect[0]).to.equal('billingaddress');
			expect(result.rootSelect[1]).to.equal('shippingaddress');
		});

		it('should build an appropriate populateReverse object', function () {
			const personModel = mongoose.model('test-person');
			const addressModel = mongoose.model('test-address');
			const operations = {
				_select: "person.name,address1,city",
				_connect: ["person.billingaddress", "person.shippingaddress"]
			};
			const query = {};
			const selectOpts = {
				root: {
					address1: 1,
					city: 1,
					"person.billingaddress": 1,
					"person.shippingaddress": 1
				},
				applyRoot: true
			};
			const options = {
				// mongoose,
				query,
				operations,
				// model: personModel,
				entity: {
					model: personModel,
					modelPrefix: 'test-',
					modelName: 'test-person'
				},
				selectOpts
			};
			const handlerUtils = new HandlerUtils({mongoose});
			const result = handlerUtils.processConnectOperator(options);
			expect(result).to.be.an.instanceof(Object);
			expect(result).to.have.property('populateReverse');
			expect(result.populateReverse).to.have.length(2);
			expect(result.populateReverse[0]).to.have.property('entity').equal('person');
			expect(result.populateReverse[0]).to.have.property('attribute').equal('billingaddress');
			expect(result.populateReverse[0]).to.have.property('select').equal('');
			expect(result.populateReverse[1]).to.have.property('entity').equal('person');
			expect(result.populateReverse[1]).to.have.property('attribute').equal('shippingaddress');
			expect(result.populateReverse[1]).to.have.property('select').equal('');
			//
			expect(result).to.have.property('populateRegular');
			expect(result.populateRegular).to.have.length(0);
			//
			expect(result).to.have.property('rootSelect');
			expect(result.rootSelect).to.have.length(0);
		});

		describe('should query a handfull of records using _connect', function () {
			this.timeout(5000);
			const people = {};
			const addresses = {
				find: function (id) {
					const foundKey = Object.keys(this).find((key) => {
						return this[key] && this[key]._id && this[key]._id === id;
					});
					return this[foundKey].toObject();
				}
			};

			before(function () {
				const Person = mongoose.model('test-person');
				const Address = mongoose.model('test-address');

				return Address.create({
					address1: '123 Here St.',
					city: 'Toronto'
				}).then(function (toronto) {
					addresses.toronto = toronto;
					// 
					return Address.create({
						address1: '456 There Ct.',
						city: 'Montreal'
					});
				}).then(function (montreal) {
					addresses.montreal = montreal;
					// 
					return Address.create({
						address1: '789 NoWhere Pl.',
						city: 'Vancouver'
					});
				}).then(function (vancouver) {
					addresses.vancouver = vancouver;
					// 
					return Person.create({
						name: 'Tony Hawk',
						billingaddress: addresses.toronto._id,
						shippingaddress: addresses.vancouver._id
					});
				}).then(function (hawk) {
					people.hawk = hawk;
					// 
					return Person.create({
						name: 'Jack Black',
						shippingaddress: addresses.vancouver._id
					});
				}).then(function (black) {
					people.black = black;
					// 
					return Person.create({
						name: 'Tony Soprano',
						billingaddress: addresses.montreal._id,
						shippingaddress: addresses.montreal._id
					});
				}).then(function (soprano) {
					people.soprano = soprano;
				});
			}); // End of before

			it('can find record with BuildQuery and _select', function (done) {
				// Finding Tony
				const Person = mongoose.model('test-person');
				const query = Person.find({})
				query.and({
					_id: people.soprano._id
				});

				const req = {
					query: {
						_select: 'name'
					},
					locals: {
						user: {
							username: 'Foobar'
						}
					}
				};
				const entity = {
					model: Person,
					modelPrefix: 'test-',
					modelName: 'test-person'
				};

				const handlerUtils = new HandlerUtils({mongoose});
				const detailedQuery = handlerUtils.buildQuery(query, req, entity);

				detailedQuery.exec().then(function (items) {
					expect(items).to.have.length(1);
					// First item
					const item = items[0].toObject();
					expect(item).to.have.property('_id').and.eql(people.soprano._id);
					expect(item).to.have.property('name').and.equal(people.soprano.name);
					expect(Object.keys(item).length).to.equal(2, "found extra attributes using _select");
					done();
				});
			});

			// 
			it('can find record with BuildQuery, _sort and _select', function (done) {
				const Person = mongoose.model('test-person');
				const query = Person.find({})
				query.and({
					name: new RegExp("^tony", 'i')
				}); // Names like 'Tony*'

				const req = {
					query: {
						_sort: '-name',
						_select: 'name,shippingaddress'
					},
					locals: {
						user: {
							username: 'Foobaz'
						}
					}
				};
				const entity = {
					model: Person,
					modelPrefix: 'test-',
					modelName: 'test-person'
				};

				const handlerUtils = new HandlerUtils({mongoose});
				const detailedQuery = handlerUtils.buildQuery(query, req, entity);

				detailedQuery.exec().then(function (items) {
					expect(items).to.have.length(2);
					let item;
					// First item
					item = items[0].toObject();
					expect(item).to.have.property('_id').and.eql(people.soprano._id);
					expect(item).to.have.property('name').and.equal(people.soprano.name);
					expect(item).to.have.property('shippingaddress').and.eql(people.soprano.shippingaddress);
					expect(Object.keys(item).length).to.equal(3, "found extra attributes");
					// Next item
					item = items[1].toObject();
					expect(item).to.have.property('_id').and.eql(people.hawk._id);
					expect(item).to.have.property('name').and.equal(people.hawk.name);
					expect(item).to.have.property('shippingaddress').and.eql(people.hawk.shippingaddress);
					expect(Object.keys(item).length).to.equal(3, "found extra attributes");
					done();
				});
			});

			// 
			it('can find record with BuildQuery, _sort and _connect', function (done) {
				const Person = mongoose.model('test-person');
				const query = Person.find({});
				query.and({
					name: new RegExp("^tony", 'i')
				}); // Names like 'Tony*'

				const req = {
					query: {
						_sort: '-name',
						_connect: 'shippingaddress',
						_select: 'name,shippingaddress'
					},
					locals: {
						user: {
							username: 'Foobax'
						}
					}
				};
				const entity = {
					model: Person,
					modelPrefix: 'test-',
					modelName: 'test-person'
				};
				
				const handlerUtils = new HandlerUtils({mongoose});
				const detailedQuery = handlerUtils.buildQuery(query, req, entity);

				detailedQuery.exec().then(function (items) {
					expect(items).to.have.length(2);
					let item;
					// First item
					item = items[0].toObject();
					expect(item).to.have.property('_id').and.eql(people.soprano._id);
					expect(item).to.have.property('name').and.equal(people.soprano.name);
					expect(item.shippingaddress).to.eql(addresses.find(people.soprano.shippingaddress));
					expect(Object.keys(item).length).to.equal(3, "found extra attributes on Soprano");
					// Next item
					item = items[1].toObject();
					expect(item).to.have.property('_id').and.eql(people.hawk._id);
					expect(item).to.have.property('name').and.equal(people.hawk.name);
					expect(item.shippingaddress).to.eql(addresses.find(people.hawk.shippingaddress));
					expect(Object.keys(item).length).to.equal(3, "found extra attributes on Hawk");
					done();
				});
			});
			// 

		});

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

	after(function () {
		return mongoose.disconnect();
		// done();
	});
});