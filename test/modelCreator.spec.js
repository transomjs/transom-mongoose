'use strict';
const PocketRegistry = require('pocket-registry');
const {
	Schema
} = require('mongoose');
const expect = require('chai').expect;

const ModelCreator = require('../lib/modelCreator');
const dbMongoose = require('./modelCreator.sample');

// Default plugins
const transomAuditablePlugin = require('../lib/plugins/auditablePlugin');
const transomAclPlugin = require('../lib/plugins/aclPlugin');
const transomToCsvPlugin = require('../lib/plugins/toCsvPlugin');
const TYPEKEY = '$myTypeKey';

describe('modelCreator', function () {

	const server = {};
	let modelCreator;

	before(function () {
		server.registry = new PocketRegistry();
		server.registry.set('transom-config.definition.mongoose', dbMongoose);

		modelCreator = new ModelCreator({server, 
			modelPrefix: 'foo-',
			typeKey: TYPEKEY,
			auditable: transomAuditablePlugin,
			acl: transomAclPlugin,
			toCsv: transomToCsvPlugin
		});
	});

	afterEach(function () {
		// delete mongoosePaginate.paginate.options;
	});

	it('modelCreator is an Object', function () {
		expect(modelCreator).to.be.an.instanceOf(Object);
	});

	it('address schema properties', function () {
		
		let address = modelCreator.createSchema({
			server
		}, dbMongoose.address);

		expect(address).to.be.an.instanceOf(Object);
		expect(address.obj._id).to.be.an.instanceOf(Object);
		expect(address.obj._id).to.have.property(TYPEKEY).and.to.equal(Schema.Types.ObjectId);

		expect(address.obj.city).to.be.an.instanceOf(Object);
		expect(address.obj.city).to.have.property("name").and.to.equal('City');
		expect(address.obj.city).to.have.property(TYPEKEY).and.to.equal(Schema.Types.String);
		expect(address.obj.city).to.have.property("required").and.to.equal(false);
		expect(address.obj.city.default).to.be.an.instanceOf(Function);
		expect(address.obj.city.default()).to.equal('New York');

		expect(address.obj.address_line1).to.have.property("name").and.to.equal('Address Line 1');
		expect(address.obj.address_line1).to.have.property(TYPEKEY).and.to.equal(Schema.Types.String);
		expect(address.obj.address_line1).to.have.property("required").and.to.equal(true);
		expect(address.obj.address_line1.default).to.be.an.instanceOf(Function);
		expect(address.obj.address_line1.default()).to.equal('123 Default Street');

		expect(address.obj.address_line2).to.have.property("name").and.to.equal('Address Line2');
		expect(address.obj.address_line2).to.have.property(TYPEKEY).and.to.equal(Schema.Types.String);
		expect(address.obj.address_line2).to.have.property("required").and.to.equal(false);
		expect(address.obj.address_line2.default).to.be.undefined;

		expect(Object.keys(address.obj).length).to.equal(4, "address has extra properties");
	});

	it('person schema properties', function () {
		dbMongoose.person.code = 'person';
		dbMongoose.person.name = 'Person';

		let person = modelCreator.createSchema({
			server,
			entities: {
				address: {}
			}
		}, dbMongoose.person);

		expect(person).to.be.an.instanceOf(Object);
		expect(person.obj._id).to.be.an.instanceOf(Object);
		expect(person.obj._id).to.have.property(TYPEKEY).and.to.equal(Schema.Types.ObjectId);

		expect(person.obj.firstname).to.be.an.instanceOf(Object);
		expect(person.obj.firstname).to.have.property("name").and.to.equal('First Name');
		expect(person.obj.firstname).to.have.property(TYPEKEY).and.to.equal(Schema.Types.String);
		expect(person.obj.firstname).to.have.property("required").and.to.equal(true);

		expect(person.obj.lastname).to.have.property("name").and.to.equal('Lastname');

		expect(person.obj.creditcard).to.have.property("get").and.to.be.an.instanceOf(Function);
		expect(person.obj.creditcard).to.have.property("set").and.to.be.an.instanceOf(Function);

		expect(person.obj.billing).to.have.property("name").and.to.equal('Billing Address');
		expect(person.obj.billing).to.have.property(TYPEKEY).and.to.equal(Schema.Types.ObjectId);
		expect(person.obj.billing).to.have.property("ref").and.to.equal('foo-address');

		expect(person.obj.shipping).to.have.property("name").and.to.equal('Shipping Address');
		expect(person.obj.shipping).to.have.property(TYPEKEY).and.to.equal(Schema.Types.ObjectId);
		expect(person.obj.shipping).to.have.property("ref").and.to.equal('foo-address');

		expect(person.obj.balance).to.have.property(TYPEKEY).and.to.equal(Schema.Types.Number);
		expect(person.obj.balance).to.have.property("required").and.to.equal(true);
		expect(person.obj.balance.default).to.be.an.instanceOf(Function);
		expect(person.obj.balance.default()).to.be.a('number');
		expect(Object.keys(person.obj).length).to.equal(7, "person has extra properties");

		expect(person.virtuals.fullname).to.have.property("getters").and.to.be.an.instanceOf(Array);
		expect(person.virtuals.fullname.getters.length).to.equal(1);
		expect(person.virtuals.fullname).to.have.property("setters").and.to.be.an.instanceOf(Array);
		expect(person.virtuals.fullname.setters.length).to.equal(0);

		expect(person.virtuals.running).to.have.property("getters").and.to.be.an.instanceOf(Array);
		expect(person.virtuals.running.getters.length).to.equal(0);
		expect(person.virtuals.running).to.have.property("setters").and.to.be.an.instanceOf(Array);
		expect(person.virtuals.running.setters.length).to.equal(0);

		expect(person.virtuals.modifiedBy).to.have.property("getters").and.to.be.an.instanceOf(Array);
		expect(person.virtuals.modifiedBy.getters.length).to.equal(1);
		expect(person.virtuals.modifiedBy).to.have.property("setters").and.to.be.an.instanceOf(Array);
		expect(person.virtuals.modifiedBy.setters.length).to.equal(1);

		expect(Object.keys(person.virtuals).length).to.equal(3, "person has extra virtual properties");

	});

	it('address has _acl', function () {
		let address = modelCreator.createSchema({
			server
		}, dbMongoose.address);

		expect(address).to.be.an.instanceOf(Object);
		expect(address.paths._acl).to.be.an.instanceOf(Schema.Types.Mixed);
		expect(address.paths._acl).to.have.property("isRequired").and.to.equal(true);
		expect(address.paths._acl).to.have.property("defaultValue");
		expect(address.paths._acl.defaultValue).to.have.property("public").and.to.equal(4);
		expect(address.paths._acl.defaultValue).to.have.property("owner").and.to.deep.equal({
			CURRENT_USERID: 2
		});
		expect(address.paths._acl.defaultValue).to.have.property("groups").and.to.deep.equal({});
	});

	after(function (done) {
		//mongoose.connection.db.dropDatabase(done);
		done();
	});

	after(function (done) {
		// mongoose.disconnec	t(done);
		done();
	});
});