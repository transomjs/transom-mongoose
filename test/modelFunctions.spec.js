'use strict';
const mongoose = require('mongoose');
const {
	Schema
} = require('mongoose');
const expect = require('chai').expect;
const modelFunctions = require('../lib/modelFunctions');

describe('modelFunctions', function() {

	before(function(done) {
		done();
	});

	afterEach(function() {
		// delete mongoosePaginate.paginate.options;
	});

	it('modelFunctions is an Object', function() {
		expect(modelFunctions).to.be.an.instanceOf(Object);
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
