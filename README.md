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
The documentation is still a work in progress ....

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
    routes: {},
    connect: {
		poolSize: 10,
		// useMongoClient: true
		useCreateIndex: true,
		useFindAndModify: false,
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
}

transom.configure(transomMongoose, options);

const myApi = require('./myApi');

// Initialize all of the configured modules.
const server = transom.initialize(myApi);
```
### The options object
The options object has the following properties:

* **connect**: Pass a boolean 'false' to skip internal mongodb connection, an Object to override defaults, or undefined to use the default connection options.
* **mongodbUri**: string, mandatory. The connection string to connect the api server to a MongoDB database
* **mongooseKey**: string optional. The string literal to use for the mongoose instance the in the [Transom registry](). Default is '`mongoose`'. 
* **modelPrefix**: The prefix to use for the mongoose models that are generated from the api definition. Default is '`dynamic-`'.
* **preMiddleware**: Array of mongoose pre- middleware functions.
* **postMiddleware**: Array  of mongoose post- middleware functions.
* **models**: Used to enable REST Api end points on mongoose models that are not defined in the api definition, but are supplied by your server application through another plugin or custom code.

### API Definitions for the plugin 
You'll need to include a 'mongoose' object in your api definition as a child of `definition`:
```javascript
"mongoose": {
    "collations": {
        default: { locale: 'simple' }, // Sorts a-z, A-Z
        usorted: { locale: 'en', caseFirst: 'upper', caseLevel: true }, // Sorts A,a - Z,z
        lsorted: { locale: 'en', caseFirst: 'lower', caseLevel: true } // Sorts a,A - z,Z
    },  
    "entities": {
        /* Define an Address model with the following Attributes. 
            Primary Key and Audit columns are added automatically.*/
        "address": {
            "collation": "default", // See details as defined above in mongoose.collations.default
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
    /* The following definition of 'country' is the minimum required to define a model attribute. */
                "country": "string"
            },            
            "audit": {
                "createdBy": "createdBy",
                "updatedBy": "updatedBy",
                "createdAt": "createdDate",
                "updatedAt": "updatedDate"
            },
            "acl": {
                "create": ["public", "admin", "agents"],
                "default": {
                    "public": 2,
                    "owner": {
                        "CURRENT_USER": 4
                    }, 
                    "groups": {
                        "agents": 7
                    }
                }
            },
            "actions": {
                pre: {
                    init: function (server, item) {
                        console.log("This is a pre-init action!", JSON.stringify(item));
                    },
                    validate: function (server, next) {
                        console.log("This is a pre-validate action!");
                        next();
                    },
                    save: [
                        function (server, next) {
                            console.log("This is ONE pre-save action!");
                            next();
                        },
                        function (server, next) {
                            console.log("This is TWO pre-save action!");
                            this.address_line1 = (this.address_line1 || "").toUpperCase();
                            next();
                        },
                        function (server, next) {
                            console.log("This is THREE pre-save action!");
                            next();
                        }
                    ],
                    remove: function (server, next) {
                        console.log("This is a pre-remove action!");
                        next();
                    }
                },
                post: {
                    init: function (server, item) {
                        console.log("This is a post-init action!", JSON.stringify(item));
                    },
                    validate: function (server, item) {
                        console.log("This is a post-validate action!");
                    },
                    save: function (server, item) {
                        console.log("This is a post-save action!");
                    },
                    remove: function (server, item, next) {
                        console.log("This is a post-remove action!");
                        next();
                    }
                }
            }
        },
    },
    etc...
```

> **Note:** The API definition file is JavaScript (not JSON), so bits of metadata can be extracted to external files and included as necessary. This could be especially useful in the case of `actions` as they could require stand-alone tests and may otherwise detract from the readability of the definition.

#### Collations
As of MongoDB v3.4 we can specify collations that define how data is searched and sorted. Add a `collations` node under `mongoose` as a place to define the collations that can be used to create your Schemas, or used with the `_collation` URL query parameter. 

E.g. 
```/api/v2/db/address?_sort=address_line2&_collation=usorted```

 Alternatively, the `collation` key on an entity can specify the collation object directly, sidestepping the named collation. In this case there's no ability to specify this collation as a URL parameter

#### Entity definition
The `mongoose` object is used to define `entities` which are used to create Mongoose models that map to Collections in the database. Each entity is customized using the metadata contained within it. 
A Mongoose schema is defined using the `attributes` property. An `audit` property allows disabling or renaming the audit fields used on generated Models. The `acl` property is used to specfiy authorization characteristics if a security plugin is available. The `actions` property is used to specify custom action functions that are triggerd when interacting with an entity.

#### Entity Attributes
Each property of the attributes object is either a string specifying the datatype or an object.

Simplest form: 
```Javascript
addressLine1: "string"
```
The default datatype is `string`, so the following is equivalent:
```Javascript
addressLine1: {}
```

A more typical attribute looks something like this:
```Javasript
addressLine1: {
    name: "Address Line 1",
    required: true,
    textsearch: 10,
    type: "string",
    default: "123 Default Street"
}
```

The object can have the following properties:

|Property| Type | Required | Description                    |
|--------|------|----------|--------------------------|
| name | string| no | The name of the attribute. This will be the property name in the json that is returned from the REST API |
| required | boolean | no | Defaults to false. When set to true, it ensures that data stored using the REST API will always include a value for the attribute.|
| type | string | no | Defaults to 'string'. The data type of the attribute. Mongoose data types are all valid, plus `binary` and `connector` |
| default | literal or function | no | The default value to use on insert when no value is provided. This can be a literal value that matches the data type of the attribute, or a function that returns such a value.|
| textsearch | number | no | Text search attribute weights are used to create a text index on the MongoDB collection. This is used in conjunction with the `_keywords` query parameter to search across fields for data that matches the '_keywords' value.|
| min | number | no | Applicable to 'number' and 'string' attributes only. The lowest acceptable value or minimum length string.|
| max | number | no | Applicable to 'number' and 'string' attributes only. The highest acceptable value or maximum length string.|
| uppercase | boolean | no | Applicable to 'string' attributes only. Uppercase string values. |
| lowercase | boolean | no | Applicable to 'string' attributes only. Lowercase string values. |
| trim | boolean | no | Applicable to 'string' attributes only. Trim string values. |
| enum | array | no | Applicable to 'mixed' attributes only. An array of acceptable values. |
| match | regex | no | Applicable to 'string' attributes only. A validation Regex. |
| order | nunmber | no | the relative sort order of the attributes, i.e which atribute comes first in output like CSV exports. |
| connect_entity | string | no* | The name of the related child Entity (within the same api definition). |

> \* When the Attribute type is `connector`, the `connect_entity` is required and must match the name of an existing entity.


#### Database Action function definitons
The action needs to be configured in the `mongoose` section of the api definition.
There are two types of action functions, the ```pre``` action and the ```post``` action. The before is typically used to apply business rules and potentially trigger an error in case of validation errors. 

The ```post``` action is called after the database action is complete. It is used for additional processing on the server, for instance, triggering notifications or performing additional processing.

These functions are implemented using  ```pre``` and ```post``` hooks in [mongoose](http://mongoosejs.com/docs/3.8.x/docs/middleware.html).

<strong>Pre Function</strong>
```javascript
function (server, next){
    // [server] is the TransomJS instance
    // [next] is a callback function
    // Note that the record instance is not passed in, it is referenced using `this`.
    if (this.fieldValue === 'bad'){
        next('bad data');
    } else {
        next();
    }
}
``` 

<strong>Post Function</strong>
```javascript
function (server, item, next) {
    // [server] is the TransomJS instance
    // [item] is the modified record
    // [next] is a callback function that must be called on completion of processing,
    //        optionally with an error object argument, in which case the api request
    //        will return an error, however the database action will not be rolled back.
    try {
        somethingAmazingSync(item);
        next();
    } catch(err) {
       next(err);
    }
}
```

#### The Entity Security definition
The security features for the entity are specified in the `acl` property of the entity (Access Control List). Set `acl: false` to disable acl handling on a particular entity. The address entity in the following API definition uses ACL to manage row-level permissions. The AclUser and AclGroup collections and the corresponding endpoints are created and managed with Transom module @transomjs/transom-mongoose-localuser.
```javascript
"entities": {
    "address": {
        "attributes": {
            "address_line1": "string",
            "address_line2": "string",
            "city": "string",
            "country": "string"
        },
        "acl": {
            "create": ["public", "admins", "agents"],
            "default": {
                "public": 1,
                "owner": {
                    "CURRENT_USER": 7
                }, 
                "groups": {
                    "agents": 3
                }
            }
        }
    },
}
```
##Create
Logged in Users with the following groups, `public`, `admins` and `agents` are able to create new Address records.
##Default
* Members on the public group are able to create and read Address records.
* Members on the agents group are able to create, read and edit Address records.
* Only the Owner (the AclUser who created it) is able to delete an Address record.
