let CheckForCustomer = function(
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
          invalidMsg = "Check For Customer - Invalid Request: ncUtil was not passed into the function";
      } else if (!channelProfile) {
          invalid = true;
          invalidMsg = "Check For Customer - Invalid Request: channelProfile was not passed into the function";
      } else if (!channelProfile.channelAuthValues) {
          invalid = true;
          invalidMsg = "Check For Customer - Invalid Request: channelAuthValues is missing from channelProfile";
      } else if (!channelProfile.channelSettingsValues) {
          invalid = true;
          invalidMsg = "Check For Customer - Invalid Request: channelSettingsValues is missing from channelProfile";
      } else if (!channelProfile.channelSettingsValues.protocol) {
          invalid = true;
          invalidMsg = "Check For Customer - Invalid Request: channelProfile.channelSettingsValues.protocol is missing";
      } else if (!channelProfile.channelSettingsValues.api_uri) {
          invalid = true;
          invalidMsg = "Check For Customer - Invalid Request: channelProfile.channelSettingsValues.api_uri is missing";
      } else if (!channelProfile.channelSettingsValues.minor_version) {
          invalid = true;
          invalidMsg = "Check For Customer - Invalid Request: channelProfile.channelSettingsValues.minor_version is missing";
      } else if (!channelProfile.channelAuthValues.realm_id) {
          invalid = true;
          invalidMsg = "Check For Customer - Invalid Request: channelProfile.channelAuthValues.realm_id is missing";
      } else if (!channelProfile.channelAuthValues.access_token) {
          invalid = true;
          invalidMsg = "Check For Customer - Invalid Request: channelProfile.channelAuthValues.access_token is missing";
      } else if (!channelProfile.customerBusinessReferences) {
          invalidMsg = "Check For Customer - Invalid Request: channelProfile.customerBusinessReferences is missing";
          invalid = true;
      } else if (!Array.isArray(channelProfile.customerBusinessReferences)) {
          invalidMsg = "Check For Customer - Invalid Request: channelProfile.customerBusinessReferences is expected to be an array";
          invalid = true;
      } else if (channelProfile.customerBusinessReferences.length == 0) {
          invalidMsg = "Check For Customer - Invalid Request: channelProfile.customerBusinessReferences does not have any values";
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
          let customerBusinessReference = [];

          channelProfile.customerBusinessReferences.forEach(function (businessReference) {
              let expression = jsonata(businessReference);
              let value = expression.evaluate(payload.doc);
              if (businessReference.startsWith('PrimaryEmailAddr')) {
                values.push("PrimaryEmailAddr = '" + encodeURIComponent(value) + "'");
              } else {
                values.push(businessReference + " = '" + encodeURIComponent(value) + "'");
              }
              customerBusinessReference.push(encodeURIComponent(value));
          });

          // Set our query for looking up customers
          let lookup = "&query=select * from Customer Where " + values.join(" AND ");

          // Set headers
          let headers = {};
          headers = {
              "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token,
              "Accept": "application/json"
          }

          url += minorVersion + lookup

          log("Using URL [" + url + "]", ncUtil);

          let options = {
              url: url,
              headers: headers
          };

          // Pass in our URL and headers
          request(options, function (error, response, body) {
              try {
                  if (!error) {
                      log("Do CheckForCustomer Callback", ncUtil);
                      out.response.endpointStatusCode = response.statusCode;
                      out.response.endpointStatusMessage = response.statusMessage;

                      // Parse data
                      let data = JSON.parse(JSON.stringify(body));

                      // 200 Response
                      if (response.statusCode == 200) {
                        data = JSON.parse(body);
                        // _embedded.self is an array of customer data
                        // One customer will return ncStatusCode = 200
                        // More than one customer will return ncStatusCode = 409

                        // _embedded.self is only returned if there is customer data
                        // If not present, return ncStatusCode = 204
                        if (data.QueryResponse.Customer) {
                          if (data.QueryResponse.Customer && data.QueryResponse.Customer.length == 1) {
                              let customer = data.QueryResponse.Customer[0];
                              out.ncStatusCode = 200;
                              out.payload.customerRemoteID = customer.Id;
                              out.payload.customerBusinessReference = extractBusinessReference(channelProfile.customerBusinessReferences, customer);
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
                      logError("Do CheckForCustomer Callback error - " + error, ncUtil);
                      out.ncStatusCode = 500;
                      out.payload.error = { err: error };
                      callback(out);
                  }
              } catch (err) {
                  logError("Exception occurred in CheckForCustomer - " + err, ncUtil);
                  console.log(err);
                  out.payload.error = { err: err, stackTrace: err.stackTrace };
                  out.ncStatusCode = 500;
                  callback(out);
              }
          });
        }
        catch (err){
            logError("Exception occurred in CheckForCustomer - " + err, ncUtil);
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

module.exports.CheckForCustomer = CheckForCustomer;
