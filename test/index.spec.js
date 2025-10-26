'use strict';

const PocketRegistry = require('pocket-registry');
const sinon = require('sinon');
const transomMongoose = require('../index');

describe('index', function() {
    const __entity = 0;
    let dummyServer;
	let chai;
	let expect;

    before(() => {
		return import('chai').then(ch => {
			chai = ch;
			chai.use(require('chai-datetime'));
			expect = chai.expect;
		}).catch(err => {
            console.log('ERROR', err);
        });
    });

	beforeEach(function(done) {
        dummyServer = {};
        dummyServer.registry = new PocketRegistry();
        dummyServer.get = sinon.spy();
        dummyServer.put = sinon.spy();
        dummyServer.post = sinon.spy();
        dummyServer.del = sinon.spy();

        // uri prefix is required when setting up routes.
        dummyServer.registry.set('transom-config.definition.uri.prefix', '/api/v1');
		done();
	});

	afterEach(function(done) {
        if (dummyServer.registry.has('mongoose')) {
            const connectedMongoose = dummyServer.registry.get('mongoose');
            connectedMongoose.connection.close().then(() => {
                done();
            }).catch(err => {
                console.log('ERROR', err);
            });
        } else {
            done();
        }
    });

	it('transomMongoose is an Object with initialize and preStart', function() {
		expect(transomMongoose).to.be.an.instanceOf(Object);
		expect(transomMongoose.initialize).to.be.an.instanceOf(Function);
		expect(transomMongoose.preStart).to.be.an.instanceOf(Function);
	});

    // These wildcard routes are GONE!
	it('Setup the generic __entity routes', function() {
        transomMongoose.initialize(dummyServer, {
            connect: false // Avoid waiting around for mongo connections!
        }).then(() => { 
            // While we're using :__entity, routes only get created ONCE!
            // Using explicit routes, there's none.
            const entityCounter = __entity;
            
            expect(dummyServer.get.callCount).to.be.equal(entityCounter * 4);
            expect(dummyServer.put.callCount).to.be.equal(entityCounter);
            expect(dummyServer.post.callCount).to.be.equal(entityCounter);
            expect(dummyServer.del.callCount).to.be.equal(entityCounter * 2);
        });
	});

	it('With everything disabled on a custom model', function() {
        const options = {
            connect: false,
            models: {
                myMongooseModel: {
                    routes: {
                        // GET
                        find: false,
                        findCount: false,
                        findBinary: false,
                        findById: false,
                        // PUT 
                        insert: false,
                        // POST
                        updateById: false,
                        // DELETE
                        delete: false, // disabled on the generic route!
                        deleteById: false,
                        deleteBatch: false
                    }
                }
            }
        };
        
        transomMongoose.initialize(dummyServer, options);
        // Using explicit routes, there's none.
        const entityCounter = __entity;

        expect(dummyServer.get.callCount).to.be.equal(entityCounter * 4);
        expect(dummyServer.put.callCount).to.be.equal(entityCounter);
        expect(dummyServer.post.callCount).to.be.equal(entityCounter);
        expect(dummyServer.del.callCount).to.be.equal(entityCounter * 2);
	});

	it('With everything on :__entity disabled', function() {
        const options = {
            connect: false,
            models: {
                ":__entity": {
                    routes: {
                        // GET
                        find: false,
                        findCount: false,
                        findBinary: false,
                        findById: false,
                        // PUT 
                        insert: false,
                        // POST
                        updateById: false,
                        // DELETE
                        delete: false, // disabled on the generic route!
                        deleteById: false,
                        deleteBatch: false
                    }
                }
            }
        };
        
        transomMongoose.initialize(dummyServer, options);
        const entityCounter = __entity; // the Generic case!

        expect(dummyServer.get.callCount).to.be.equal(entityCounter * 4);
        expect(dummyServer.put.callCount).to.be.equal(entityCounter);
        expect(dummyServer.post.callCount).to.be.equal(entityCounter);
        expect(dummyServer.del.callCount).to.be.equal(entityCounter * 2);
	});

	it('With :__entity and a custom model', function() {
        const options = {
            connect: false,
            models: {
                "horse": {
                    routes: {
                        delete: false // match the :__entity default!
                    }
                }
            }
        };
        
        transomMongoose.initialize(dummyServer, options);
        const horse = 1;
        const entityCounter = __entity + horse;

        expect(dummyServer.get.callCount).to.be.equal(entityCounter * 4);
        expect(dummyServer.put.callCount).to.be.equal(entityCounter);
        expect(dummyServer.post.callCount).to.be.equal(entityCounter);
        expect(dummyServer.del.callCount).to.be.equal(entityCounter * 2);
	});

	it('custom model pre-middleware', function() {
        const options = {
            connect: false,
            models: {
                "horse": {
                    modelName: "diyHorseModel",
                    routes: {} // everything is enabled!
                },
                "kitten": {
                    modelName: "diyKittenModel",
                    routes: {} // everything is enabled!
                }
            }
        };
        
        transomMongoose.initialize(dummyServer, options);
        const horse = 1;
        const kitten = 1;
        const entityCounter = kitten + horse;
        expect(dummyServer.get.callCount).to.be.equal(entityCounter * 4);
        expect(dummyServer.put.callCount).to.be.equal(entityCounter);

        const horsePutArgs = dummyServer.put.getCall(0).args;
        expect(horsePutArgs[0]).to.equal(`/api/v1/db/horse/:__id`);
        expect(dummyServer.post.callCount).to.be.equal(entityCounter);

        const horsePostArgs = dummyServer.post.getCall(0).args;
        expect(horsePostArgs[0]).to.equal(`/api/v1/db/horse`);

        // last pre-middleware sets req.locals.__entity to an object with the entity name.
        const horsePreMiddleware = horsePostArgs[1];
        const assignEntity = horsePreMiddleware[horsePreMiddleware.length -1];
        const req = {
            locals: {},
            params: {}
        };
        const res = null;
        assignEntity(req, res, function() {
            const entity = req.locals.__entity;
            expect(entity.entity).to.be.equal("horse");
            expect(entity.modelName).to.be.equal("diyHorseModel");
        });

        const kittenPostArgs = dummyServer.post.getCall(1).args;
        expect(kittenPostArgs[0]).to.equal(`/api/v1/db/kitten`);
        expect(dummyServer.del.callCount).to.be.equal(entityCounter * 3);
	});

	after(function(done) {
		done();
    });
    
});
