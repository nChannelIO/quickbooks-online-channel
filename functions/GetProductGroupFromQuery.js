'use strict';

let product = require('./GetProductSimpleFromQuery');
let extractBusinessReference = require('../util/extractBusinessReference');
let jsonata = require('jsonata');

let GetProductGroupFromQuery = function (
  ncUtil,
  channelProfile,
  flowContext,
  payload,
  callback) {

  log("Building response object...");
  let out = {
    ncStatusCode: null,
    response: {},
    payload: {}
  };

  let invalid = false;
  let invalidMsg = "";

  if (!channelProfile.productGroupBusinessReferences) {
    invalid = true;
    invalidMsg = "channelProfile.productGroupBusinessReferences was not provided"
  } else if (!Array.isArray(channelProfile.productGroupBusinessReferences)) {
    invalid = true;
    invalidMsg = "channelProfile.productGroupBusinessReferences is not an array"
  } else if (channelProfile.productGroupBusinessReferences.length === 0) {
    invalid = true;
    invalidMsg = "channelProfile.productGroupBusinessReferences is empty"
  }

  //If a query document was not passed in, the request is invalid
  if (!payload) {
    invalid = true;
    invalidMsg = "payload was not provided"
  } else if (!payload.doc) {
    invalid = true;
    invalidMsg = "payload.doc was not provided";
  } else if (payload.doc.remoteIDs) {
    invalid = true;
    invalidMsg = "getting product groups by remoteID is not supported for QuickBooks Online"
  } else if (!payload.doc.searchFields && !payload.doc.modifiedDateRange) {
    invalid = true;
    invalidMsg = "either payload.doc.remoteIDs or payload.doc.searchFields or payload.doc.modifiedDateRange must be provided"
  } else if (payload.doc.searchFields && payload.doc.modifiedDateRange) {
    invalid = true;
    invalidMsg = "payload.doc.searchFields or payload.doc.modifiedDateRange may be provided"
  } else if (payload.doc.searchFields && (!Array.isArray(payload.doc.searchFields) || payload.doc.searchFields.length === 0)) {
    invalid = true;
    invalidMsg = "payload.doc.searchFields must be an Array with at least 1 key value pair: {searchField: 'key', searchValues: ['value_1']}"
  } else if (payload.doc.searchFields) {
    for (let i = 0; i < payload.doc.searchFields.length; i++) {
      if (!payload.doc.searchFields[i].searchField || !Array.isArray(payload.doc.searchFields[i].searchValues) || payload.doc.searchFields[i].searchValues.length === 0) {
        invalid = true;
        invalidMsg = "payload.doc.searchFields[" + i + "] must be a key value pair: {searchField: 'key', searchValues: ['value_1']}";
        break;
      }
    }
  } else if (payload.doc.modifiedDateRange && !(payload.doc.modifiedDateRange.startDateGMT || payload.doc.modifiedDateRange.endDateGMT)) {
    invalid = true;
    invalidMsg = "at least one of payload.doc.modifiedDateRange.startDateGMT or payload.doc.modifiedDateRange.endDateGMT must be provided"
  } else if (payload.doc.modifiedDateRange && payload.doc.modifiedDateRange.startDateGMT && payload.doc.modifiedDateRange.endDateGMT && (payload.doc.modifiedDateRange.startDateGMT > payload.doc.modifiedDateRange.endDateGMT)) {
    invalid = true;
    invalidMsg = "startDateGMT must have a date before endDateGMT";
  }

  //If callback is not a function
  if (!callback) {
    throw new Error("A callback function was not provided");
  } else if (typeof callback !== 'function') {
    throw new TypeError("callback is not a function")
  }

  if (!invalid) {
    // Business references must reference from the root of the document. Since the productGroup schema only has one property at the root (Items),
    // we can remove this portion of the reference so that it references starting at the root of the product.
    channelProfile.productGroupBusinessReferences = channelProfile.productGroupBusinessReferences.reduce((newReferences, reference) => {
      if (reference.startsWith('Items')) {
        newReferences.push(reference.substring(reference.indexOf('.') + 1));
      } else {
        newReferences.push(reference);
      }
      return newReferences;
    }, []);

    log("No Quickbooks product group endpoint. Deferring to GetProductSimpleFromQuery");

    try {
      // Modified date range query
      if (payload.doc.modifiedDateRange) {
        GetProductGroupsByTimeRange(ncUtil, channelProfile, flowContext, payload, callback, {});
      } else if (payload.doc.searchFields) {
        // Search fields query
        GetAllProductsInGroup(ncUtil, channelProfile, flowContext, payload, function (msg) {
          if (msg.ncStatusCode === 200) {
            // Add the productGroupBusinessReference
            msg.payload.productGroupBusinessReference = extractBusinessReference(channelProfile.productGroupBusinessReferences, msg.payload.doc.Items[0]);

            // Turn the payload in to an array
            msg.payload = [msg.payload];
          }

          callback(msg);
        });
      }
    } catch (err) {
      logError("Exception occurred in GetProductGroupFromQuery - err" + err);
      out.ncStatusCode = 500;
      out.payload.error = {
        err: err,
        stack: err.stackTrace
      };
      callback(out);
    }

  } else {
    log("Callback with an invalid request");
    out.ncStatusCode = 400;
    out.payload.error = invalidMsg;
    callback(out);
  }
};

/**
 * Retrieves all product groups which have changed in the given time range.
 *
 * Paging is handled internally. The callback function may be called multiple times.
 *
 * Payload is expected to be a `modifiedTimeRange` query
 *
 * Ex:
 * {
 *   doc: {
 *     modifiedDateRange: {
 *       startDateGMT: '2017-05-12T10:00:00.000Z',
 *       endDateGMT: '2017-05-12T12:00:00.000Z'
 *     },
 *     page: 1,
 *     pageSize: 25
 *   }
 * }
 *
 * @param ncUtil
 * @param channelProfile
 * @param flowContext
 * @param payload
 * @param callback
 * @param cache
 */
function GetProductGroupsByTimeRange(ncUtil, channelProfile, flowContext, payload, callback, cache) {
  product.GetProductSimpleFromQuery(ncUtil, channelProfile, flowContext, payload, function (msg) {
    log("Do GetProductGroupFromQuery Callback");

    // If GetProduct did not return an error then group the products by the product group BR
    if (msg.ncStatusCode === 200 || msg.ncStatusCode === 206) {
      let products = coalescePayloadDocs(msg.payload);
      let groups = getGroupReferencesSet(products, channelProfile.productGroupBusinessReferences);

      getFullGroups(groups, cache, function (msg) {
        callback(msg);
      });

    } else {
      // Otherwise leave the msg un-altered
      callback(msg);
    }

    if (msg.ncStatusCode === 206) {
      payload.doc.page += 1;
      GetProductGroupsByTimeRange(ncUtil, channelProfile, flowContext, payload, callback, cache);
    }
  });

  /**
   * Get the entire product group for each group uniquely identified in `groups`
   *
   * @param groups - dictionary of productGroupBusinessReferences and key-value pairs. See `getGroupReferencesSet`
   * @param cache - object containing the businessReferences of already processed groups
   * @param callback - function called once all groups have processed
   * @param groupNames - keys in the `groups` dictionary; defaults to Object.keys(groups)
   * @param accumulator - accumulator for processed groups; defaults to []
   */
  function getFullGroups(groups, cache, callback, groupNames = Object.keys(groups), accumulator = []) {
    if (groupNames.length === 0) {
      let res = {
        ncStatusCode: accumulator.length > 0 ? 200 : 204,
        payload: accumulator
      };
      callback(res);
    } else {
      let groupName = groupNames.pop();
      if (!cache[groupName]) {
        let groupQueryPayload = buildQueryPayload(groups[groupName]);
        groupQueryPayload.doc.pageSize = payload.doc.pageSize;

        GetAllProductsInGroup(ncUtil, channelProfile, flowContext, groupQueryPayload, function (msg) {
          if (msg.ncStatusCode === 200) {
            msg.payload.productGroupBusinessReference = groupName;
            msg.payload.productGroupRemoteID = msg.payload.doc.Items[0].Item.Id;

            accumulator.push(msg.payload);
            cache[groupName] = true;
            getFullGroups(groups, cache, callback, groupNames, accumulator);
          } else {
            callback(msg);
          }
        });
      } else {
        getFullGroups(groups, cache, callback, groupNames, accumulator);
      }
    }
  }
}

/**
 * Get the entire product group. i.e. an array of the all products with matching key-value pairs (BRs)
 *
 * Paging is handled internally to retrieve all products in the group.
 *
 * Payload is expected to be a `searchFields` query.
 *
 * Ex:
 * {
 *   doc: {
 *     searchFields: [{
 *       searchField: 'Name',
 *       searchValues: ['Office Supplies']
 *     }],
 *     page: 1,
 *     pageSize: 25
 *   }
 * }
 *
 * @param ncUtil
 * @param channelProfile
 * @param flowContext
 * @param payload
 * @param callback
 */
function GetAllProductsInGroup(ncUtil, channelProfile, flowContext, payload, callback) {
  queryForGroup([], payload, callback);

  function queryForGroup(group, payload, callback) {
    product.GetProductSimpleFromQuery(ncUtil, channelProfile, flowContext, payload, function (msg) {
      if (msg.ncStatusCode === 200 || msg.ncStatusCode === 206) {
        group = group.concat(coalescePayloadDocs(msg.payload))
      }
      if (msg.ncStatusCode === 206) {
        payload.doc.page += 1;
        queryForGroup(group, payload, callback);
      } else if (msg.ncStatusCode === 200 || msg.ncStatusCode === 204) {
        let res = {
          ncStatusCode: group.length > 0 ? 200 : 204,
          payload: {
            doc: {Items: group}
          }
        };
        callback(res);
      } else {
        callback(msg);
      }
    });

  }
}

/**
 * Given an array of payloads, returns an array of <payload.doc>
 *
 * Ex: Converts this payload
 * [
 *   {
 *     doc: {<doc1>},
 *     productBusinessReference: ...,
 *     productRemoteID: ...
 *   },
 *   {
 *     doc: {<doc2>},
 *     productBusinessReference: ...,
 *     productRemoteID: ...
 *   },
 *   ...
 * ]
 *
 * into this
 * [
 *   {<doc1>},
 *   {<doc2>},
 *   ...
 * ]
 *
 * @param payload
 */
function coalescePayloadDocs(payload) {
  return payload.reduce((group, payload) => {
    group.push(payload.doc);
    return group;
  }, []);
}

/**
 * Given a dictionary of key-value pairs (businessReference-value), constructs a `searchFields` query document.
 *
 * @param brMap - a map of businessReference key-value pairs
 * @returns {{doc: {searchFields: Array, page: number}}}
 */
function buildQueryPayload(brMap) {
  let payload = {
    doc: {
      searchFields: [],
      page: 1
    }
  };
  Object.keys(brMap).forEach((field) => {
    let searchField = {
      searchField: field,
      searchValues: [brMap[field]]
    };
    payload.doc.searchFields.push(searchField);
  });
  return payload;
}

/**
 * Returns a dictionary of productGroupBusinessReferences and key-value pairs
 *
 * Ex:
 * {
 *   'Office Supplies.1111': {
 *     'Name': 'Office Supplies',
 *     'Sku': '1111'
 *   },
 *   'School Supplies.2222': {
 *     'Name': 'School Supplies',
 *     'Sku': '2222'
 *   },
 *   ...
 * }
 *
 * @param products - an array of products
 * @param businessReferences - keys used to extract the productGroupBusinessReference
 */
function getGroupReferencesSet(products, businessReferences) {
  return products.reduce((groups, item) => {
    let values = [];
    let brMap = {};
    businessReferences.forEach((businessReference) => {
      let expression = jsonata(businessReference);
      let value = expression.evaluate(item);
      values.push(value);
      brMap[businessReference.split('.').pop()] = value;
    });
    let groupName = values.join('.');
    if (!groups[groupName]) {
      groups[groupName] = brMap;
    }
    return groups;
  }, {});
}

function logError(msg) {
  console.log("[error] " + msg);
}

function log(msg) {
  console.log("[info] " + msg);
}

module.exports.GetProductGroupFromQuery = GetProductGroupFromQuery;
