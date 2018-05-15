'use strict';

let extractBusinessReference = require('../util/extractBusinessReference');
let request = require('request');

let GetProductSimpleFromQuery = function (
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

  //If channelProfile does not contain channelSettingsValues, channelAuthValues or productBusinessReferences, the request can't be sent
  if (!channelProfile) {
    invalid = true;
    invalidMsg = "channelProfile was not provided"
  } else if (!channelProfile.channelSettingsValues) {
    invalid = true;
    invalidMsg = "channelProfile.channelSettingsValues was not provided"
  } else if (!channelProfile.channelSettingsValues.protocol) {
    invalid = true;
    invalidMsg = "channelProfile.channelSettingsValues.protocol was not provided"
  } else if (!channelProfile.channelSettingsValues.api_uri) {
    invalid = true;
    invalidMsg = "channelProfile.channelSettingsValues.api_uri was not provided"
  } else if (!channelProfile.channelSettingsValues.minor_version) {
    invalid = true;
    invalidMsg = "channelProfile.channelSettingsValues.minor_version was not provided";
  } else if (!channelProfile.channelAuthValues) {
    invalid = true;
    invalidMsg = "channelProfile.channelAuthValues was not provided"
  } else if (!channelProfile.channelAuthValues.access_token) {
    invalid = true;
    invalidMsg = "channelProfile.channelAuthValues.access_token was not provided"
  } else if (!channelProfile.channelAuthValues.realm_id) {
    invalid = true;
    invalidMsg = "channelProfile.channelAuthValues.realm_id was not provided"
  } else if (!channelProfile.productBusinessReferences) {
    invalid = true;
    invalidMsg = "channelProfile.productBusinessReferences was not provided"
  } else if (!Array.isArray(channelProfile.productBusinessReferences)) {
    invalid = true;
    invalidMsg = "channelProfile.productBusinessReferences is not an array"
  } else if (channelProfile.productBusinessReferences.length === 0) {
    invalid = true;
    invalidMsg = "channelProfile.productBusinessReferences is empty"
  }

  //If a query document was not passed in, the request is invalid
  if (!payload) {
    invalid = true;
    invalidMsg = "payload was not provided"
  } else if (!payload.doc) {
    invalid = true;
    invalidMsg = "payload.doc was not provided";
  } else if (!payload.doc.remoteIDs && !payload.doc.searchFields && !payload.doc.modifiedDateRange && !payload.doc.createdDateRange) {
    invalid = true;
    invalidMsg = "either payload.doc.remoteIDs or payload.doc.searchFields or payload.doc.modifiedDateRange or payload.doc.createdDateRange must be provided"
  } else if (payload.doc.remoteIDs && (payload.doc.searchFields || payload.doc.modifiedDateRange || payload.doc.createdDateRange)) {
    invalid = true;
    invalidMsg = "only one of payload.doc.remoteIDs or payload.doc.searchFields or payload.doc.modifiedDateRange or payload.doc.createdDateRange may be provided"
  } else if (payload.doc.remoteIDs && (!Array.isArray(payload.doc.remoteIDs) || payload.doc.remoteIDs.length === 0)) {
    invalid = true;
    invalidMsg = "payload.doc.remoteIDs must be an Array with at least 1 remoteID"
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
    invalidMsg = "modifiedDateRange startDateGMT must have a date before endDateGMT";
  } else if (payload.doc.createdDateRange && !(payload.doc.createdDateRange.startDateGMT || payload.doc.createdDateRange.endDateGMT)) {
    invalid = true;
    invalidMsg = "at least one of payload.doc.createdDateRange.startDateGMT or payload.doc.createdDateRange.endDateGMT must be provided"
  } else if (payload.doc.createdDateRange && payload.doc.createdDateRange.startDateGMT && payload.doc.createdDateRange.endDateGMT && (payload.doc.createdDateRange.startDateGMT > payload.doc.createdDateRange.endDateGMT)) {
    invalid = true;
    invalidMsg = "createdDateRange startDateGMT must have a date before endDateGMT";
  }

  //If callback is not a function
  if (!callback) {
    throw new Error("A callback function was not provided");
  } else if (typeof callback !== 'function') {
    throw new TypeError("callback is not a function")
  }

  if (!invalid) {
    //Set a default pageSize
    if (!payload.doc.pageSize) {
      payload.doc.pageSize = 25;
    }


    let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;

    let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/query" + minorVersion;


    let url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

    /*
     Create query string for searching customers by specific fields
     */
    let queryParams = [];
    let filterParams = [];

    if (payload.doc.searchFields) {
      let fields = [];
      payload.doc.searchFields.forEach(function (searchField) {
        // Loop through each value
        let values = [];
        searchField.searchValues.forEach(function (searchValue) {
          if (searchField.searchField === "Active") {
            let value = (searchValue === "true");
            values.push(value);
          } else {
            values.push("'" + searchValue + "'");
          }
        });

        if (searchField.searchField === "Active") {
          fields.push(searchField.searchField + " = " + values.join(''));
        } else {
          fields.push(searchField.searchField + " IN (" + values.join(',') + ")");
        }
      });

      filterParams.push(fields.join(' AND '));

    } else if (payload.doc.remoteIDs) {
      /*
       Add remote IDs as a query parameter
       */
      let ids = [];
      payload.doc.remoteIDs.forEach((remoteID) => {
        ids.push("'" + remoteID + "'");
      });

      filterParams.push("Id IN (" + ids.join(',') + ")");

    } else if (payload.doc.modifiedDateRange) {
      /*
       Add modified date ranges to the query
       */
      if (payload.doc.modifiedDateRange.startDateGMT) {
        filterParams.push("MetaData.LastUpdatedTime >= '" + payload.doc.modifiedDateRange.startDateGMT + "'");
      }
      if (payload.doc.modifiedDateRange.endDateGMT) {
        filterParams.push("MetaData.LastUpdatedTime <= '" + payload.doc.modifiedDateRange.endDateGMT + "'");
      }
    } else if (payload.doc.createdDateRange) {
      /*
       Add created date ranges to the query
       */
      if (payload.doc.createdDateRange.startDateGMT) {
        filterParams.push("MetaData.CreateTime >= '" + payload.doc.createdDateRange.startDateGMT + "'");
      }
      if (payload.doc.createdDateRange.endDateGMT) {
        filterParams.push("MetaData.CreateTime <= '" + payload.doc.createdDateRange.endDateGMT + "'");
      }
    }

    // Only get products that have a business reference, i.e. br value is not null
    channelProfile.productBusinessReferences.forEach(businessReference => {
      filterParams.push(`${businessReference.split('.').pop()} != ' '`);
    });


    // Format the 'filter' query parameter
    queryParams.push(filterParams.join(' AND '));

    /*
     Add page to the query
     */
    let startDoc = (payload.doc.page - 1) * payload.doc.pageSize;
    if (payload.doc.page) {
      if (startDoc > 0) {
        queryParams.push("STARTPOSITION " + startDoc);
      }
    }

    /*
     Add pageSize (limit) to the query
     */
    if (payload.doc.pageSize) {
      queryParams.push("MAXRESULTS " + payload.doc.pageSize);
    }

    /*
     Format the query parameters and append them to the url
     */
    url += "&query=SELECT * FROM Item WHERE " + queryParams.join(' ');

    log("Using URL [" + url + "]");

    // Add the authorization header
    headers = {
      "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token,
      "Accept": "application/json"
    }

    /*
     Set URL and headers
     */
    let options = {
      url: url,
      headers: headers,
      json: true
    };

    // Pass in our URL and headers
    request(options, function (error, response, body) {
      try {
        if (!error) {
          log("Do GetProductSimpleFromQuery Callback");
          out.response.endpointStatusCode = response.statusCode;
          out.response.endpointStatusMessage = response.statusMessage;

          // Parse data
          let docs = [];
          let data = body;

          if (response.statusCode === 200) {
            // If we have an array of products, set out.payload to be the array of products returned
            if (data.QueryResponse.Item && data.QueryResponse.Item.length > 0) {
              for (let i = 0; i < data.QueryResponse.Item.length; i++) {
                let product = {
                  Item: data.QueryResponse.Item[i]
                };
                docs.push({
                  doc: product,
                  productRemoteID: product.Item.Id,
                  productBusinessReference: extractBusinessReference(channelProfile.productBusinessReferences, product)
                });
              }
              if (docs.length === payload.doc.pageSize) {
                out.ncStatusCode = 206;
              } else {
                out.ncStatusCode = 200;
              }
              out.payload = docs;
            } else {
              out.ncStatusCode = 204;
              out.payload = data;
            }
          } else if (response.statusCode === 429) {
            out.ncStatusCode = 429;
            out.payload.error = data;
          } else if (response.statusCode === 500) {
            out.ncStatusCode = 500;
            out.payload.error = data;
          } else {
            out.ncStatusCode = 400;
            out.payload.error = data;
          }

          callback(out);
        } else {
          logError("Do GetProductSimpleFromQuery Callback error - err " + error);
          out.ncStatusCode = 500;
          out.payload.error = error;
          callback(out);
        }
      } catch (err) {
        logError("Exception occurred in GetProductSimpleFromQuery - err " + err);
        out.ncStatusCode = 500;
        out.payload.error = {
          err: err,
          stack: err.stackTrace
        };
        callback(out);
      }
    });
  } else {
    log("Callback with an invalid request - " + invalidMsg);
    out.ncStatusCode = 400;
    out.payload.error = invalidMsg;
    callback(out);
  }
};

function logError(msg) {
  console.log("[error] " + msg);
}

function log(msg) {
  console.log("[info] " + msg);
}

module.exports.GetProductSimpleFromQuery = GetProductSimpleFromQuery;
