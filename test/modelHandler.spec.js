'use strict';

const mongoose = require('mongoose');
const {
	Schema
} = require('mongoose');
const modelHandler = require('../lib/modelHandler');

describe('modelHandler', function() {
	let expect;

	before(function(done) {
		import('chai').then(chai => {
			expect = chai.expect;
			done();
		});
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
