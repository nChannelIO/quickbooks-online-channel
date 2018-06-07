'use strict';

let extractBusinessReference = require('../util/extractBusinessReference');
let request = require('request');

let InsertSalesOrder = function (
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

  // Check channelProfile properties
  if (!channelProfile) {
    invalid = true;
    invalidMsg = "InsertSalesOrder - Invalid Request: channelProfile was not passed into the function";
  } else if (!channelProfile.channelAuthValues) {
    invalid = true;
    invalidMsg = "InsertSalesOrder - Invalid Request: channelAuthValues is missing from channelProfile";
  } else if (!channelProfile.channelSettingsValues) {
    invalid = true;
    invalidMsg = "InsertSalesOrder - Invalid Request: channelSettingsValues is missing from channelProfile";
  } else if (!channelProfile.channelSettingsValues.protocol) {
    invalid = true;
    invalidMsg = "InsertSalesOrder - Invalid Request: channelProfile.channelSettingsValues.protocol is missing";
  } else if (!channelProfile.channelSettingsValues.api_uri) {
    invalid = true;
    invalidMsg = "InsertSalesOrder - Invalid Request: channelProfile.channelSettingsValues.api_uri is missing";
  } else if (!channelProfile.channelSettingsValues.minor_version) {
    invalid = true;
    invalidMsg = "InsertSalesOrder - Invalid Request: channelProfile.channelSettingsValues.minor_version is missing";
  } else if (!channelProfile.channelAuthValues.realm_id) {
    invalid = true;
    invalidMsg = "InsertSalesOrder - Invalid Request: channelProfile.channelAuthValues.realm_id is missing";
  } else if (!channelProfile.channelAuthValues.access_token) {
    invalid = true;
    invalidMsg = "InsertSalesOrder - Invalid Request: channelProfile.channelAuthValues.access_token is missing";
  } else if (!channelProfile.salesOrderBusinessReferences) {
    invalidMsg = "Insert Sales Order - Invalid Request: channelProfile.salesOrderBusinessReferences is missing";
    invalid = true;
  } else if (!Array.isArray(channelProfile.salesOrderBusinessReferences)) {
    invalidMsg = "Insert Sales Order - Invalid Request: channelProfile.salesOrderBusinessReferences is expected to be an array";
    invalid = true;
  } else if (channelProfile.salesOrderBusinessReferences.length === 0) {
    invalidMsg = "Insert Sales Order - Invalid Request: channelProfile.salesOrderBusinessReferences does not have any values";
    invalid = true;
  }

  // Check callback
  if (!callback) {
    throw new Error("A callback function was not provided");
  } else if (typeof callback !== 'function') {
    throw new TypeError("callback is not a function")
  }

  // Check Payload
  if (!payload) {
    invalidMsg = "Insert Sales Order - Invalid Request: payload was not provided";
    invalid = true;
  } else if (!payload.doc) {
    invalidMsg = "Insert Sales Order - Invalid Request: payload.doc was not provided";
    invalid = true;
  } else if (!payload.billingCustomerRemoteID) {
    invalidMsg = "Insert Sales Order - Invalid Request: payload.billingCustomerRemoteID was not provided";
    invalid = true;
  }

  if (!invalid) {
    try {

      // First query items by sku to update the sales order line items with their remote ids. If at least one can't be found return a 400.

      // Get a list of skus
      let skus = payload.doc.Line.reduce((skus, line) => {
        if (line.DetailType === 'SalesItemLineDetail' && line.SalesItemLineDetail.ItemRef.name !== 'Shipping' && line.SalesItemLineDetail.ItemRef.name !== undefined) {
          skus[line.SalesItemLineDetail.ItemRef.name] = {Id: undefined};
        }
        // else skip
        return skus;
      }, {});

      // Build a GET Product Query Object
      let query = {
        doc: {
          searchFields: [{
            searchField: 'Sku',
            searchValues: Object.keys(skus)
          }],
          page: 1,
          pageSize: 25
        }
      };

      // Set the Sku as the business reference so that the stub function pulls it out of the document for us :)
      channelProfile.productBusinessReferences = ['Item.Sku'];
      // Build a recursive function to execute the query until we don't receive a 206
      let product = require('./GetProductSimpleFromQuery');
      let getAllProducts = function (query, callback, cache) {
        // Execute the query
        product.GetProductSimpleFromQuery(ncUtil, channelProfile, flowContext, query, (response) => {
          if (!cache) {
            // If this is the first response from Get Product then initialize the cache
            cache = response;
          } else if (response.ncStatusCode === 200 || response.ncStatusCode === 206) {
            // otherwise concat the payload
            cache.payload = cache.payload.concat(response.payload);
          }

          if (response.ncStatusCode === 200 || response.ncStatusCode === 204) {
            // Stop recursion and return the cache
            if (cache.payload.length > 0) {
              cache.ncStatusCode = 200;
            }
            callback(cache);
          } else if (response.ncStatusCode === 206) {
            // Increment the page and make a recursive call
            query.doc.page++;
            getAllProducts(query, callback, cache);
          } else {
            // Error - return the error response
            callback(response);
          }
        });
      };

      // Call getAllProducts
      getAllProducts(query, (response) => {
        if (response.ncStatusCode === 200) {
          // Make sure we got a product for each sku in the query
          response.payload.forEach((doc) => {
            if (skus[doc.productBusinessReference] === undefined) {
              // Somehow we got a product we didn't ask for...I guess we can live with it so I won't throw an error
            } else {
              skus[doc.productBusinessReference].Id = doc.productRemoteID;
            }
          });
          let errors = [];
          Object.keys(skus).forEach(sku => {
            if (skus[sku].Id === undefined) {
              // Didn't get this product. Throw an error
              errors.push('The GET Product Query did not return a result for sku: ' + sku);
            }
          });

          if (errors.length > 0) {
            // Stop now and return an error
            out.ncStatusCode = 400;
            out.payload.error = {err: errors};
            callback(out);
          } else {
            // Update the line items with their remote id
            payload.doc.Line.forEach(line => {
              if (line.DetailType === 'SalesItemLineDetail' && line.SalesItemLineDetail.ItemRef.name !== 'Shipping' && line.SalesItemLineDetail.ItemRef.name !== undefined) {
                line.SalesItemLineDetail.ItemRef.value = skus[line.SalesItemLineDetail.ItemRef.name].Id;
                delete line.SalesItemLineDetail.ItemRef.name
              }
            });

            // Now Insert the order

            // Create endpoint
            let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;
            let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/salesreceipt" + minorVersion;
            let url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

            let headers = {
              "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token,
              "Accept": "application/json"
            };

            log("Using URL [" + url + "]");

            // Delete the customer and replace it with the customer remoteID
            delete payload.doc.Customer;
            payload.doc.CustomerRef = {
              value: payload.billingCustomerRemoteID
            };


            /*
             Set URL and headers
             */
            let options = {
              url: url,
              method: "POST",
              headers: headers,
              body: payload.doc,
              json: true
            };

            // Pass in our URL and headers
            request(options, function (error, response, body) {
              try {
                if (!error) {

                  log("Do InsertSalesOrder Callback");
                  out.response.endpointStatusCode = response.statusCode;
                  out.response.endpointStatusMessage = response.statusMessage;

                  // Parse data
                  let data = body;

                  // If we have a customer object, set out.payload.doc to be the customer document
                  if (data && response.statusCode === 200) {
                    out.payload = {
                      doc: data.SalesReceipt,
                      "salesOrderRemoteID": data.SalesReceipt.Id,
                      "salesOrderBusinessReference": extractBusinessReference(channelProfile.salesOrderBusinessReferences, data.SalesReceipt)
                    };
                    out.ncStatusCode = 201;
                  } else if (response.statusCode === 429) {
                    out.ncStatusCode = 429;
                    out.payload.error = {err: data};
                  } else if (response.statusCode === 500) {
                    out.ncStatusCode = 500;
                    out.payload.error = {err: data};
                  } else {
                    out.ncStatusCode = 400;
                    out.payload.error = {err: data};
                  }

                  callback(out);
                } else {
                  logError("Do InsertSalesOrder Callback error - " + error);
                  out.ncStatusCode = 500;
                  out.payload.error = {err: error};
                  callback(out);
                }
              } catch (err) {
                logError("Exception occurred in InsertSalesOrder - " + err);
                out.ncStatusCode = 500;
                out.payload.error = {err: err, stackTrace: err.stackTrace};
                callback(out);
              }
            });
          }
        } else if (response.ncStatusCode === 204) {
          // Unable to find the products
          response.statusCode = 400;
          response.payload.error = {
            err: 'Unable to find the products listed on the order.',
            originalError: response.payload.error
          };
          callback(response);
        } else {
          // Error
          response.payload.error = {
            err: 'An error occurred while retrieving the products listed on the order.',
            originalError: response.payload.error
          };
          callback(response);
        }
      });
    } catch (err) {
      logError("Exception occurred in InsertSalesOrder - " + err);
      out.ncStatusCode = 500;
      out.payload.error = {err: err, stackTrace: err.stackTrace};
      callback(out);
    }

  } else {
    log("Callback with an invalid request - " + invalidMsg);
    out.ncStatusCode = 400;
    out.payload.error = {err: invalidMsg};
    callback(out);
  }
};

function logError(msg) {
  console.log("[error] " + msg);
}

function log(msg) {
  console.log("[info] " + msg);
}

module.exports.InsertSalesOrder = InsertSalesOrder;
