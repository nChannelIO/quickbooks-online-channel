'use strict';

let extractBusinessReference = require('../util/extractBusinessReference');
let request = require('request');

let InsertProductSimple = function (
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
    invalidMsg = "channelProfile.productBusinessReferences is expected to be an array";
    invalid = true;
  } else if (channelProfile.productBusinessReferences.length === 0) {
    invalid = true;
    invalidMsg = "channelProfile.productBusinessReferences is empty"
  }

  if (!payload) {
    invalid = true;
    invalidMsg = "payload was not provided"
  } else if (!payload.doc) {
    invalid = true;
    invalidMsg = "payload.doc was not provided"
  } else if (!payload.doc.Item) {
    invalid = true;
    invalidMsg = "payload.doc.Item was not provided"
  }

  //If callback is not a function
  if (!callback) {
    throw new Error("A callback function was not provided");
  } else if (typeof callback !== 'function') {
    throw new TypeError("callback is not a function")
  }

  if (!invalid) {
    let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;
    let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/item" + minorVersion;
    let url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

    /*
     Format url
     */
    let headers = {
      "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token,
      "Accept": "application/json"
    };

    log("Using URL [" + url + "]");

    let item = payload.doc.Item;

    /*
     Set URL and headers
     */
    let options = {
      url: url,
      method: "POST",
      headers: headers,
      body: item,
      json: true
    };

    try {
      // Pass in our URL and headers
      request(options, function (error, response, body) {
        if (!error) {

          log("Do InsertProduct Callback");
          out.response.endpointStatusCode = response.statusCode;
          out.response.endpointStatusMessage = response.statusMessage;

          // Parse data
          let data = JSON.parse(JSON.stringify(body));

          // If we have a product object, set out.payload.doc to be the product document
          if (data && response.statusCode === 200) {
            out.payload = {
              doc: data,
              "productRemoteID": data.Id,
              "productBusinessReference": extractBusinessReference(channelProfile.productBusinessReferences, data)
            };

            out.ncStatusCode = 201;
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
          logError("Do InsertProduct Callback error - " + error);
          out.ncStatusCode = 500;
          out.payload.error = {err: error};
          callback(out);
        }
      });
    } catch (err) {
      logError("Exception occurred in InsertProduct - " + err);
      out.ncStatusCode = 500;
      out.payload.error = {err: err, stack: err.stackTrace};
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

module.exports.InsertProductSimple = InsertProductSimple;
