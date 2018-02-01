# transom-mongoose
Transom-mongoose is a plugin for a [TransomJS REST api server](https://transomjs.github.io/).
With this plugin, you can define mongoose models quickly and easily, and expose them through a comprehensive set of pre-built CRUD endpoints that are added to the REST API. Include custom logic in pre & post hooks, apply auditing and secure your data.

[![Build Status](https://travis-ci.org/transomjs/transom-mongoose.svg?branch=master)](https://travis-ci.org/transomjs/transom-mongoose)
[![Coverage Status](https://coveralls.io/repos/github/transomjs/transom-mongoose/badge.svg?branch=master)](https://coveralls.io/github/transomjs/transom-mongoose?branch=master)

## Installation

```bash
$ npm install --save transom-mongoose
```

## Usage
This is still a work in progress ....

The transom-mongoose plugin needs to be configured and initialized on your Transom REST API server as follows:

mongodb://username:password@host:port/database?options...'

```javascript
var TransomCore = require('@transomjs/transom-core');
var transomMongoose = require('@transomjs/transom-mongoose');

const transom = new TransomCore();

const options = {
    mongodbUri: valueFromTheEnvironment,
    mongooseKey: undefined,
    modelPrefix: undefined,
    preMiddleware: [],
    postMiddleware: [],
    routes: {}
}

transom.configure(transomMongoose, options);

var myApi = require('./myApi');

// Initialize them all at once.
var server = transom.initialize(myApi);
```
### The options object
The options object has the following mandatory properties:

* mongodbUri: string, mandatory. The connection string to connect the api server to the database
* mongooseKey: string optional. The string literal to use for the mongoose instance the in the [Transom registry](). Default is `'mongoose'`. 
* modelPrefix: The prefix to use for the mongoose models that are generated from the api definition. Default is `'dynamic-'`.
* preMiddleware: Array of mongoose pre- middleware functions.
* postMiddleware: Array  of mongoose pos- middleware functions.
* routes: Used to enable REST Api end points on mongoose models that are not defined in the api definition, but are supplied by your server application through another plugin or custom code.

### API Definitions for the plugin 
You'll need to include a 'mongoose' object in your api definition as a child of ```definition```:
```javascript
"mongoose": {
    "address": {
        "attributes": {
            "address_line1": {
                "name": "Address Line 1",
                "required": true,
                "textsearch": 10,
                "type": "string",
                "default": "123 Default Street"
            },
            "address_line2": {
                "name": "Address Line 2",
                "required": true,
                "textsearch": 10,
                "type": "string",
                "default": "Apartment B3"
            },
            "city": {
                "name": "City"
            },
            "country": "Country"
        },
        "acl": {
            "create": ["public", "admin", "agents"],
            "default": {
                "public": 2,
                "owner": {
                    "CURRENT_USERID": 4
                }, 
                "groups": {
                    "agents": 7
                }
            }
        }
    },
    ...
```

The `mongoose` object has a property for each of the entities in the database. An entity is stored in a dedicated colletion in MongoDb.
The schema of the entity is defined using the `attributes` property and an `acl` property to speciy the security characteristics, if a security plugin is vailable.

<strong>The `Attribute` definition</strong>
Each property of the attributes object is either a string with the attribute name or an object.
Simple form: 
```Javascript
address1: "Address Line 1"
```

Object form:
```Javasript
"address_line1": {
    "name": "Address Line 1",
    "required": true,
    "textsearch": 10,
    "type": "string",
    "default": "123 Default Street"
    "actions": {...}
}
```

The object can have the following properties

|Property| Type | Required | Description                    |
|--------|------|----------|--------------------------|
|name| string| yes | The name of the attribute. This will be the property name in the json that is returned from the REST API |
|required| boolean | no | Defaults to false. When set to true, it ensures that data stored using the REST API will always include a value for the attribute.|
|type | string | no | Defaults to string. The data type of the attribute. Valid values are `string`, `number`, `date`, `binary`, `connector` |
| default | literal or function | no | The default value to use on insert when no value is provided. This can be a literal value that matches the data type of the attribute, or a function that returns such a value.|
| min | number | no | Applicable to number attributes only. The lowest acceptable value |
| max | number | no | Applicable to number attributes only. The highest acceptable value |
| order | nunmber | no | the relative sort order of the attributes, i.e which atribute comes first in output like csv exports |
| connect_entity | string | yes - when type is `connector` | The name of the entity (in the same api definition) that this entity is connected to |


#### The database action function definiton
The action needs to be configured in the `mongoose` section of the api definition.
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

