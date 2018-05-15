let CheckForProduct = function(
    ncUtil,
    channelProfile,
    flowContext,
    payload,
    callback)
{

    log("Building response object...", ncUtil);
    let out = {
        ncStatusCode: null,
        response: {},
        payload: {}
    };

      let invalid = false;
      let invalidMsg = "";
      const extractBusinessReference = require('../../../../util/extractBusinessReference');

      // Check channelProfile properties
      if (!ncUtil) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: ncUtil was not passed into the function";
      } else if (!channelProfile) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: channelProfile was not passed into the function";
      } else if (!channelProfile.channelAuthValues) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: channelAuthValues is missing from channelProfile";
      } else if (!channelProfile.channelSettingsValues) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: channelSettingsValues is missing from channelProfile";
      } else if (!channelProfile.channelSettingsValues.protocol) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: channelProfile.channelSettingsValues.protocol is missing";
      } else if (!channelProfile.channelSettingsValues.api_uri) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: channelProfile.channelSettingsValues.api_uri is missing";
      } else if (!channelProfile.channelSettingsValues.minor_version) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: channelProfile.channelSettingsValues.minor_version is missing";
      } else if (!channelProfile.channelAuthValues.realm_id) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: channelProfile.channelAuthValues.realm_id is missing";
      } else if (!channelProfile.channelAuthValues.access_token) {
          invalid = true;
          invalidMsg = "Check For Product - Invalid Request: channelProfile.channelAuthValues.access_token is missing";
      } else if (!channelProfile.productBusinessReferences) {
          invalidMsg = "Check For Product - Invalid Request: channelProfile.productBusinessReferences is missing";
          invalid = true;
      } else if (!Array.isArray(channelProfile.productBusinessReferences)) {
          invalidMsg = "Check For Product - Invalid Request: channelProfile.productBusinessReferences is expected to be an array";
          invalid = true;
      } else if (channelProfile.productBusinessReferences.length == 0) {
          invalidMsg = "Check For Product - Invalid Request: channelProfile.productBusinessReferences does not have any values";
          invalid = true;
      }

      // Check callback
      if (!callback) {
          throw new Error("A callback function was not provided");
      } else if (typeof callback !== 'function') {
          throw new TypeError("callback is not a function")
      }

      // Check payload
      if (!payload) {
          invalid = true;
          invalidMsg = "payload was not provided"
      } else if (!payload.doc) {
          invalid = true;
          invalidMsg = "payload.doc was not provided";
      }

      if (!invalid) {
        try {
          const extractBusinessReference = require('../../../../util/extractBusinessReference');
          const jsonata = require('jsonata');

          let request = ncUtil.request;
          let url = "";

          // Create endpoint
          let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;
          let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/query";
          url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

          // Lookup the businessReference
          let values = [];
          let productBusinessReference = [];

          channelProfile.productBusinessReferences.forEach(function (businessReference) {
              let property = businessReference.slice(businessReference.indexOf('.')+1)
              let expression = jsonata(businessReference);
              let value = expression.evaluate(payload.doc);
              values.push(property + " = '" + value + "'");
              productBusinessReference.push(value);
          });

          // Set our query for looking up products
          let lookup = "&query=select * from Item Where " + values.join(" AND ");

          // Set headers
          let headers = {};
          headers = {
              "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token,
              "Accept": "application/json"
          }

          url += minorVersion + lookup;

          log("Using URL [" + url + "]", ncUtil);

          let options = {
              url: url,
              headers: headers
          };

          // Pass in our URL and headers
          request(options, function (error, response, body) {
              try {
                  if (!error) {
                      log("Do CheckForProduct Callback", ncUtil);
                      out.response.endpointStatusCode = response.statusCode;
                      out.response.endpointStatusMessage = response.statusMessage;

                      // Parse data
                      let data = JSON.parse(JSON.stringify(body));

                      // 200 Response
                      if (response.statusCode == 200) {
                        data = JSON.parse(body);

                        if (data.QueryResponse.Item) {
                          if (data.QueryResponse.Item && data.QueryResponse.Item.length == 1) {
                              let product = data.QueryResponse.Item[0];
                              out.ncStatusCode = 200;
                              out.payload.productRemoteID = product.Id;
                              out.payload.productBusinessReference = extractBusinessReference(channelProfile.productBusinessReferences, product);
                          } else {
                              out.ncStatusCode = 409;
                              out.payload.error = { err: data };
                          }
                        } else {
                            out.ncStatusCode = 204;
                        }
                      } else if (response.statusCode == 400) {
                          out.ncStatusCode = 400;
                          out.payload.error = { err: data };
                      } else if (response.statusCode == 429) {
                          out.ncStatusCode = 429;
                          out.payload.error = { err: data };
                      } else if (response.statusCode == 500) {
                          out.ncStatusCode = 500;
                          out.payload.error = { err: data };
                      } else {
                          out.ncStatusCode = 400;
                          out.payload.error = { err: data };
                      }
                      callback(out);
                  } else {
                      logError("Do CheckForProduct Callback error - " + error, ncUtil);
                      out.ncStatusCode = 500;
                      out.payload.error = { err: error };
                      callback(out);
                  }
              } catch (err) {
                  logError("Exception occurred in CheckForProduct - " + err, ncUtil);
                  out.payload.error = { err: err, stackTrace: err.stackTrace };
                  out.ncStatusCode = 500;
                  callback(out);
              }
          });
        }
        catch (err){
            logError("Exception occurred in CheckForProduct - " + err, ncUtil);
            out.ncStatusCode = 500;
            out.payload.error = { err: err, stackTrace: err.stackTrace };
            callback(out);
        }
      } else {
          log("Callback with an invalid request - " + invalidMsg, ncUtil);
          out.ncStatusCode = 400;
          out.payload.error = { err: invalidMsg };
          callback(out);
      }
}

function logError(msg, ncUtil) {
    console.log("[error] " + msg);
}

function log(msg, ncUtil) {
    console.log("[info] " + msg);
}

module.exports.CheckForProduct = CheckForProduct;
