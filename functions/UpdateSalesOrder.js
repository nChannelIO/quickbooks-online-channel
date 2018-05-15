let UpdateSalesOrder = function (ncUtil,
                                 channelProfile,
                                 flowContext,
                                 payload,
                                 callback) {

  log("Building response object...", ncUtil);
  let out = {
    ncStatusCode: null,
    response: {},
    payload: {}
  };

  let invalid = false;
  let invalidMsg = "";

  //If ncUtil does not contain a request object, the request can't be sent
  if (!ncUtil) {
    invalid = true;
    invalidMsg = "ncUtil was not provided"
  } else if (!ncUtil.request) {
    invalid = true;
    invalidMsg = "ncUtil.request was not provided"
  }

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
    invalidMsg = "channelProfile.salesOrderBusinessReferences was not provided";
    invalid = true;
  } else if (!Array.isArray(channelProfile.salesOrderBusinessReferences)) {
    invalidMsg = "channelProfile.salesOrderBusinessReferences is expected to be an array";
    invalid = true;
  } else if (channelProfile.salesOrderBusinessReferences.length === 0) {
    invalidMsg = "channelProfile.salesOrderBusinessReferences does not have any values";
    invalid = true;
  }

  //If a salesOrderDocument or salesOrderRemoteID was not passed in, the request is invalid
  if (!payload) {
    invalid = true;
    invalidMsg = "payload was not provided"
  } else if (!payload.doc) {
    invalid = true;
    invalidMsg = "payload.doc was not provided"
  } else if (!payload.salesOrderRemoteID) {
    invalid = true;
    invalidMsg = "payload.salesOrderRemoteID was not provided"
  }

  //If callback is not a function
  if (!callback) {
    throw new Error("A callback function was not provided");
  } else if (typeof callback !== 'function') {
    throw new TypeError("callback is not a function")
  }

  if (!invalid) {
    try {
      let request = ncUtil.request;
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

            // Now Update the order

            // Create endpoint
            let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;
            let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/salesreceipt";
            let url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

            // Set headers
            let headers = {
              "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token,
              "Accept": "application/json"
            };

            log("Using URL [" + url + "]", ncUtil);

            let readOptions = {
              url: url + "/" + payload.salesOrderRemoteID + minorVersion,
              method: "GET",
              headers: headers
            };

            // Query the salesOrder
            request(readOptions, function (error, response, read) {
              try {
                const extractBusinessReference = require('../../../../util/extractBusinessReference');
                if (!error) {
                  if (response.statusCode === 200) {
                    log("Do UpdateSalesOrder Callback", ncUtil);
                    out.response.endpointStatusCode = response.statusCode;
                    out.response.endpointStatusMessage = response.statusMessage;

                    let readData = JSON.parse(read);

                    // Get the SyncToken
                    /* Quickbooks Online expects a SyncToken to be passed in with body of the update (i.e. "1")
                       Querying for the sales reciept will give us the most recent SyncToken that can be used with the update
                       Not providing the SyncToken or using a previously used SyncToken will return an error
                       Quickbook will automatically increment the SyncToken on each update
                    */
                    let syncToken = parseInt(readData.SalesReceipt.SyncToken);

                    // Add salesOrderRemoteID to Id of doc as it's required for this function
                    payload.doc.Id = payload.salesOrderRemoteID;

                    // Replace the customer object with the customerRemoteID
                    delete payload.doc.Customer;
                    payload.doc.CustomerRef = {
                      value: payload.billingCustomerRemoteID
                    };

                    // Set the SyncToken
                    payload.doc.SyncToken = syncToken;

                    // Set sparse to true to do a partial update
                    payload.doc.sparse = true;

                    let options = {
                      url: url + minorVersion,
                      method: "POST",
                      headers: headers,
                      body: payload.doc,
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

                          // If we have a sales reciept object, set payload.doc to be the sales reciept document
                          if (data && response.statusCode == 200) {
                            out.payload = {
                              doc: data.SalesReceipt,
                              "salesOrderRemoteID": data.SalesReceipt.Id,
                              "salesOrderBusinessReference": extractBusinessReference(channelProfile.salesOrderBusinessReferences, data.SalesReceipt)
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
                          logError("Do UpdateSalesOrder Callback error - " + error, ncUtil);
                          out.payload.error = {err: error};
                          out.ncStatusCode = 400;
                          callback(out);
                        }
                      } catch (err) {
                        logError("Exception occurred in UpdateSalesOrder - " + err, ncUtil);
                        out.ncStatusCode = 500;
                        out.payload.error = {err: err, stack: err.stackTrace};
                        callback(out);
                      }
                    });
                  } else if (response.statusCode === 429) {
                    out.ncStatusCode = 429;
                    out.payload.error = {err: read};
                    callback(out);
                  } else if (response.statusCode === 500) {
                    out.ncStatusCode = 500;
                    out.payload.error = {err: read};
                    callback(out);
                  } else {
                    out.ncStatusCode = 400;
                    out.payload.error = {err: read};
                    callback(out);
                  }
                } else {
                  logError("Do UpdateSalesOrder Callback error - " + error, ncUtil);
                  out.payload.error = error;
                  out.ncStatusCode = 400;
                  callback(out);
                }

              } catch (err) {
                logError("Exception occurred in UpdateSalesOrder - " + err, ncUtil);
                out.ncStatusCode = 500;
                out.payload.error = {err: err, stack: err.stackTrace};
                callback(out);
              }
            });
          }
        } else if (response.ncStatusCode === 204) {
          // Unable to find the products
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
      logError("Exception occurred in InsertSalesOrder - " + err, ncUtil);
      out.ncStatusCode = 500;
      out.payload.error = {err: err, stackTrace: err.stackTrace};
      callback(out);
    }
  } else {
    log("Callback with an invalid request - " + invalidMsg, ncUtil);
    out.ncStatusCode = 400;
    out.payload.error = {err: "Callback with an invalid request - " + invalidMsg};
    callback(out);
  }
};

function logError(msg, ncUtil) {
  console.log("[error] " + msg);
}

function log(msg, ncUtil) {
  console.log("[info] " + msg);
}

module.exports.UpdateSalesOrder = UpdateSalesOrder;
