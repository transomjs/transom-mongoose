const aclConstants = {
	READ_UPDATE_DELETE: 7,
	READ_WRITE: 6,
	READ_DELETE: 5,
	READ: 4,
	UPDATE_DELETE: 3,
	WRITE: 2,
	DELETE: 1,
	NIL: 0,

};

module.exports = {
	"address": {
		"code":"address",
		"name":"Address",
		"acl": {
			"create": ["public", "admin", "agents", "hillbilly"],
			"default": {
				"public": aclConstants.READ,
				"owner": {
					"CURRENT_USERID": aclConstants.WRITE
				}, // Defaults to: {"CURRENT_USER": 7}
				"x-groups": {
					"agents": aclConstants.READ_WRITE
				}
			}
		},
		"attributes": {
			"address_line1": {
				"name": "Address Line 1",
				"required": true,
				"textsearch": 5,
				"type": "string",
				"default": "123 Default Street"
			},
			"address_line2": "string",
			"city": {
				"name": "City",
				"required": false,
				"textsearch": 10,
				"type": "string",
				"default": "New York"
			}
		}
	},
	"person": {
		"methods": ["GET", "POST", "PUT", "not DELETE"],
		"acl": {
			"create": ["public", "admin", "agents", "hillbilly"],
			"default": {
				"public": 7,
				"owner": {
					"JamesBond": 4
				}, // Defaults to: {"CURRENT_USER": 7}
				"groups": {
					"agents": 6
				}
			}
		},
		"attributes": {
			"lastname": {
				"order": 200
			},
			"firstname": {
				"name": "First Name",
				"required": true,
				"type": "string",
				"order": 100
			},
			"fullname": {
				"type": "virtual",
				"get": function() {
					return (this.firstname + ' '  + this.lastname).trim();
				}
			},
			"running": {
				// A non-calculated value populated in a post-find function.
				"type": "virtual"
			},
			"creditcard": {
				"type": "string",
				"min": 16,
				"max": 20,
				"set": function(val) {
					return (val + '').toUpperCase();
				},
				"get": function(val) {
					return '****-****-****-' + val.slice(val.length-4, val.length);
				}
			},
			"balance": {
				"type": "number",
				"required": true,
				"default": function() {
					return new Date().getUTCMinutes();
				},
				"order": 200
			},
			"billing": {
				"name": "Billing Address",
				"required": false,
				"type": "connector",
				"connect_entity": "address"
			},
			"shipping": {
				"name": "Shipping Address",
				"required": false,
				"connect_entity": "address",
				"type": "connector"
			}
		}
	}
}
