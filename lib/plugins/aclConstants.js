'use strict';
/**
 * Constants used in the mongoose Acl Plugin.
 */
module.exports = {
    INT_VALUE: {
        DELETE: 4, // leftmost position
        UPDATE: 2, // middle position
        READ: 1, // rightmost position
        NIL: 0 // No permissions            
    },
    BITWISE_VALUE: {
        DELETE: 2, // leftmost position
        UPDATE: 1, // middle position
        READ: 0, // rightmost position
        NIL: -1 // Matches nothing, no permissions
    }, 
    CRUD_STRING: {
        CREATE: "CREATE",
        READ: "READ",
        UPDATE: "UPDATE",
        DELETE: "DELETE"
    },
    CURRENT_USER: "CURRENT_USER" // Optional key to use as default Owner, replaced with UserId.
};