'use strict';

const mongoose = require('mongoose');
const {
	Schema
} = require('mongoose');
const expect = require('chai').expect;
const modelHandler = require('../lib/modelHandler');

describe('modelHandler', function() {

	before(function(done) {
		done();
	});

	afterEach(function() {
		// delete mongoosePaginate.paginate.options;
	});

	it('modelHandler is an Object', function() {
		expect(modelHandler).to.be.an.instanceOf(Object);
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
