'use strict';

let extractBusinessReference = require('../util/extractBusinessReference');
let request = require('request');

let GetFulfillmentFromQuery = function (
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

  //If channelProfile does not contain channelSettingsValues, channelAuthValues or salesOrderBusinessReferences, the request can't be sent
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
  } else if (!channelProfile.salesOrderBusinessReferences) {
    invalid = true;
    invalidMsg = "channelProfile.salesOrderBusinessReferences was not provided"
  } else if (!Array.isArray(channelProfile.salesOrderBusinessReferences)) {
    invalid = true;
    invalidMsg = "channelProfile.salesOrderBusinessReferences is not an array"
  } else if (channelProfile.salesOrderBusinessReferences.length === 0) {
    invalid = true;
    invalidMsg = "channelProfile.salesOrderBusinessReferences is empty"
  } else if (!channelProfile.fulfillmentBusinessReferences) {
    invalid = true;
    invalidMsg = "channelProfile.fulfillmentBusinessReferences was not provided"
  } else if (!Array.isArray(channelProfile.fulfillmentBusinessReferences)) {
    invalid = true;
    invalidMsg = "channelProfile.fulfillmentBusinessReferences is not an array"
  } else if (channelProfile.fulfillmentBusinessReferences.length === 0) {
    invalid = true;
    invalidMsg = "channelProfile.fulfillmentBusinessReferences is empty"
  }

  //If a query document was not passed in, the request is invalid
  if (!payload) {
    invalid = true;
    invalidMsg = "payload was not provided"
  } else if (!payload.doc) {
    invalid = true;
    invalidMsg = "payload.doc was not provided";
  } else if (!payload.doc.remoteIDs && !payload.doc.modifiedDateRange) {
    invalid = true;
    invalidMsg = "either payload.doc.remoteIDs or payload.doc.modifiedDateRange must be provided"
  } else if (payload.doc.remoteIDs && payload.doc.modifiedDateRange) {
    invalid = true;
    invalidMsg = "only one of payload.doc.remoteIDs or payload.doc.modifiedDateRange may be provided"
  } else if (payload.doc.remoteIDs && (!Array.isArray(payload.doc.remoteIDs) || payload.doc.remoteIDs.length === 0)) {
    invalid = true;
    invalidMsg = "payload.doc.remoteIDs must be an Array with at least 1 remoteID"
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


    let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;

    let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/query" + minorVersion;


    let filter = require('lodash/filter');

    let url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

    /*
     Create query string for searching customers by specific fields
     */
    let queryParams = [];
    let filterParams = [];

    if (payload.doc.remoteIDs) {
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

      // Set the query to only return documents created in the last two weeks
      let moment = require('moment');
      let twoWeeksAgo = moment().subtract(14, 'days').startOf('day').utc().format();
      let createdDateQuery = "MetaData.CreateTime >= '" + twoWeeksAgo + "'";
      filterParams.push(createdDateQuery);
    }


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
    url += "&query=SELECT * FROM SalesReceipt WHERE " + queryParams.join(' ');

    log("Using URL [" + url + "]");

    // Add the authorization header
    let headers = {
      "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token,
      "Accept": "application/json"
    };

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
          log("Do GetFulfillmentFromQuery Callback");
          out.response.endpointStatusCode = response.statusCode;
          out.response.endpointStatusMessage = response.statusMessage;

          // Parse data
          let docs = [];
          let data = body;

          if (response.statusCode === 200) {
            // If we have an array of orders, set out.payload to be the array of orders returned
            if (data.QueryResponse.SalesReceipt && data.QueryResponse.SalesReceipt.length > 0) {
              // We only need to process the SalesReceipts that have tracking number
              let fulfillments = filter(data.QueryResponse.SalesReceipt, (salesReceipt) => {
                return salesReceipt.TrackingNum;
              });

              for (let i = 0; i < fulfillments.length; i++) {
                let order = fulfillments[i];
                docs.push({
                  doc: {SalesReceipt: order},
                  salesOrderRemoteID: order.Id,
                  salesOrderBusinessReference: extractBusinessReference(channelProfile.salesOrderBusinessReferences, order),
                  fulfillmentRemoteID: order.Id,
                  fulfillmentBusinessReference: extractBusinessReference(channelProfile.fulfillmentBusinessReferences, order)
                });
              }
              if (data.QueryResponse.SalesReceipt.length === payload.doc.pageSize) {
                out.ncStatusCode = 206;
              } else if (docs.length === 0) {
                out.ncStatusCode = 204;
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
          logError("Do GetFulfillmentFromQuery Callback error - " + error);
          out.ncStatusCode = 500;
          out.payload.error = error;
          callback(out);
        }
      } catch (err) {
        logError("Exception occurred in GetFulfillmentFromQuery - err " + err);
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

module.exports.GetFulfillmentFromQuery = GetFulfillmentFromQuery;
