# transom-mongoose
Adding Mongoose support to a Transom REST API. Define mongoose models quickly and easily, then expose them through a comprehensive set of pre-built CRUD endpoints that are added to the API. Include custom logic in pre & post hooks, and apply auditing and ACL with built-in plugins.

[![Build Status](https://travis-ci.org/transomjs/transom-mongoose.svg?branch=master)](https://travis-ci.org/transomjs/transom-mongoose)
[![Coverage Status](https://coveralls.io/repos/github/transomjs/transom-mongoose/badge.svg?branch=master)](https://coveralls.io/github/transomjs/transom-mongoose?branch=master)

## Installation

```bash
$ npm install --save transom-mongoose
```

## Usage
...Work in progress

#### The database action function definiton
The action needs to be configured in the ```db``` section of the api definition. More info [here](https://github.com/transomjs/transom-mongoose/blob/master/README.md)

There are two types of action functions, the ```before``` action and the ```after``` action. The before is typically used to apply business rules and potentially trigger an error in case of validation errors. 

The ```after``` action is called after the database action is complete. It is used for additional processing on the server, for instance creating an asynchronous communication, or perform additional processing.

Both the before and after functions are implemented using  ```pre``` and ```post``` hooks in mongoose. More info [here](http://mongoosejs.com/docs/3.8.x/docs/middleware.html)

<strong>Before Function</strong>
```javascript
@param server TransomJS instance
@param next The next function that needs to be called when processing is complete. It may be called with an error argument in which case the record will not be stored in the database, and the api call responds with an error.
function (server, next){
    //note that the record instance is not passed in. It is referenced using `this`
   
    if (this.fieldValue == 'bad'){
        next('bad data');
    } else {
        next();
    }
}
``` 



<strong>After Function</strong>
```javascript
@param server TransomJS server instance
@param item The record that was stored in the database.
@param next function which must be called on completion of processing, optionally with an error object as argument, in which case the api request will return an error, however the database action will not be rolled back.
function (server, item, next) {
}
```

