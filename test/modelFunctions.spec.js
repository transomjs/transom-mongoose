'use strict';
const mongoose = require('mongoose');
const {
	Schema
} = require('mongoose');
// const expect = require('chai').expect;
const modelFunctions = require('../lib/modelFunctions');

describe('modelFunctions', function() {
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

	it('modelFunctions is an Object', function() {
		expect(modelFunctions).to.be.an.instanceOf(Object);
	});

	after(function(done) {
		done();
	});

	after(function(done) {
		done();
	});
});
