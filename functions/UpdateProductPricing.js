'use strict';

let extractBusinessReference = require('../util/extractBusinessReference');
let request = require('request');

let UpdateProductPricing = function (
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

  //If channelProfile does not contain channelSettingsValues, channelAuthValues or productPricingBusinessReferences, the request can't be sent
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
  } else if (!channelProfile.productPricingBusinessReferences) {
    invalid = true;
    invalidMsg = "channelProfile.productPricingBusinessReferences was not provided"
  } else if (channelProfile.productPricingBusinessReferences.length === 0) {
    invalid = true;
    invalidMsg = "channelProfile.productPricingBusinessReferences is empty"
  }

  //If a productDocument or productPricingRemoteID was not passed in, the request is invalid
  if (!payload) {
    invalid = true;
    invalidMsg = "payload was not provided"
  } else if (!payload.doc) {
    invalid = true;
    invalidMsg = "payload.doc was not provided"
  } else if (!payload.doc.Item) {
    invalid = true;
    invalidMsg = "payload.doc.Item was not provided"
  } else if (!payload.productPricingRemoteID) {
    invalid = true;
    invalidMsg = "payload.productPricingRemoteID was not provided"
  }

  //If callback is not a function
  if (!callback) {
    throw new Error("A callback function was not provided");
  } else if (typeof callback !== 'function') {
    throw new TypeError("callback is not a function")
  }

  if (!invalid) {


    // Create endpoint
    let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;
    let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/item";
    url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

    // Set headers
    let headers = {
      "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token
    };

    log("Using URL [" + url + "]");

    // Set ID and minor version
    let readUrl = url + "/" + payload.productPricingRemoteID + minorVersion;

    let readOptions = {
      url: readUrl,
      method: "GET",
      headers: headers,
      json: true
    };

    // Query the product
    request(readOptions, function (error, response, read) {
      try {

        if (!error) {
          if (response.statusCode === 200) {
            log("Do UpdateProductPricing Callback");
            out.response.endpointStatusCode = response.statusCode;
            out.response.endpointStatusMessage = response.statusMessage;

            let readData = JSON.parse(JSON.stringify(read));

            // Get the SyncToken
            /* Quickbooks Online expects a SyncToken to be passed in with body of the update (i.e. "1")
               Querying for the product will give us the most recent SyncToken that can be used with the update
               Not providing the SyncToken or using a previously used SyncToken will return an error
               Quickbook will automatically increment the SyncToken on each update
            */
            let syncToken = parseInt(readData.Item.SyncToken);

            // Add productPricingRemoteID to Id of doc as it's required for this function
            payload.doc.Item.Id = payload.productPricingRemoteID;

            // Set the SyncToken
            payload.doc.Item.SyncToken = syncToken;

            // Remove Item Wrapper
            let item = payload.doc.Item;

            // Set sparse to true to do a partial update (product pricing is a subset of product)
            item.sparse = true;

            let options = {
              url: url + minorVersion,
              method: "POST",
              headers: headers,
              body: item,
              json: true
            };

            // Pass in our URL and headers
            request(options, function (error, response, body) {
              try {
                if (!error) {
                  out.response.endpointStatusCode = response.statusCode;
                  out.response.endpointStatusMessage = response.statusMessage;

                  // Parse data
                  let data = JSON.parse(JSON.stringify(body));

                  // If we have a product object, set product.payload.doc to be the product document
                  if (data && response.statusCode == 200) {
                    out.payload = {
                      "productPricingBusinessReference": extractBusinessReference(channelProfile.productPricingBusinessReferences, data)
                    };

                    out.ncStatusCode = 200;
                  } else if (response.statusCode == 429) {
                    out.ncStatusCode = 429;
                    out.payload.error = data;
                  } else if (response.statusCode == 500) {
                    out.ncStatusCode = 500;
                    out.payload.error = data;
                  } else {
                    out.ncStatusCode = 400;
                    out.payload.error = data;
                  }
                  callback(out);
                } else {
                  logError("Do UpdateProductPricing Callback error - " + error);
                  out.payload.error = {err: error};
                  out.ncStatusCode = 400;
                  callback(out);
                }
              } catch (err) {
                logError("Exception occurred in UpdateProductPricing - " + err);
                out.ncStatusCode = 500;
                out.payload.error = {err: err, stack: err.stackTrace};
                callback(out);
              }
            });
          } else if (response.statusCode == 429) {
            out.ncStatusCode = 429;
            out.payload.error = {err: read};
            callback(out);
          } else if (response.statusCode == 500) {
            out.ncStatusCode = 500;
            out.payload.error = {err: read};
            callback(out);
          } else {
            out.ncStatusCode = 400;
            out.payload.error = {err: read};
            callback(out);
          }
        } else {
          logError("Do UpdateProductPricing Callback error - " + error);
          out.payload.error = error;
          out.ncStatusCode = 400;
          callback(out);
        }

      } catch (err) {
        logError("Exception occurred in UpdateProductPricing - " + err);
        out.ncStatusCode = 500;
        out.payload.error = {err: err, stack: err.stackTrace};
        callback(out);
      }
    });
  } else {
    log("Callback with an invalid request - " + invalidMsg);
    out.ncStatusCode = 400;
    out.payload.error = {err: "Callback with an invalid request - " + invalidMsg};
    callback(out);
  }
};

function logError(msg) {
  console.log("[error] " + msg);
}

function log(msg) {
  console.log("[info] " + msg);
}

module.exports.UpdateProductPricing = UpdateProductPricing;
