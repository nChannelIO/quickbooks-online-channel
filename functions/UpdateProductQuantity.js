let UpdateProductQuantity = function(ncUtil,
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

    //If channelProfile does not contain channelSettingsValues, channelAuthValues or productQuantityBusinessReferences, the request can't be sent
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
    } else if (!channelProfile.productQuantityBusinessReferences) {
        invalid = true;
        invalidMsg = "channelProfile.productQuantityBusinessReferences was not provided"
    } else if (channelProfile.productQuantityBusinessReferences.length === 0) {
        invalid = true;
        invalidMsg = "channelProfile.productQuantityBusinessReferences is empty"
    }

    //If a productDocument or productQuantityRemoteID was not passed in, the request is invalid
    if (!payload) {
        invalid = true;
        invalidMsg = "payload was not provided"
    } else if (!payload.doc) {
        invalid = true;
        invalidMsg = "payload.doc was not provided"
    } else if (!payload.doc.Item) {
        invalid = true;
        invalidMsg = "payload.doc.Item was not provided"
    } else if (!payload.productQuantityRemoteID) {
        invalid = true;
        invalidMsg = "payload.productQuantityRemoteID was not provided"
    }

    //If callback is not a function
    if (!callback) {
        throw new Error("A callback function was not provided");
    } else if (typeof callback !== 'function') {
        throw new TypeError("callback is not a function")
    }

    if (!invalid) {
        let request = ncUtil.request;

        // Create endpoint
        let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;
        let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/item";
        url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

        // Set headers
        let headers = {
            "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token
        };

        log("Using URL [" + url + "]", ncUtil);

        // Set ID and minor version
        let readUrl = url + "/" + payload.productQuantityRemoteID + minorVersion;

        let readOptions = {
            url: readUrl,
            method: "GET",
            headers: headers,
            json: true
        };

        // Query the product
        request(readOptions, function(error, response, read) {
            try {
                const extractBusinessReference = require('../../../../util/extractBusinessReference');
                if (!error) {
                    if (response.statusCode === 200) {
                        log("Do UpdateProductQuantity Callback", ncUtil);
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

                        // Add productQuantityRemoteID to Id of doc as it's required for this function
                        payload.doc.Item.Id = payload.productQuantityRemoteID;

                        // Set the SyncToken
                        payload.doc.Item.SyncToken = syncToken;

                        // Remove Item Wrapper
                        let item = payload.doc.Item;
                        
                        // Set sparse to true to do a partial update (product quantity is a subset of product)
                        item.sparse = true;

                        let options = {
                            url: url + minorVersion,
                            method: "POST",
                            headers: headers,
                            body: item,
                            json: true
                        };

                        // Pass in our URL and headers
                        request(options, function(error, response, body) {
                            try {
                                if (!error) {
                                    out.response.endpointStatusCode = response.statusCode;
                                    out.response.endpointStatusMessage = response.statusMessage;

                                    // Parse data
                                    let data = JSON.parse(JSON.stringify(body));

                                    // If we have a product object, set product.payload.doc to be the product document
                                    if (data && response.statusCode == 200) {
                                        out.payload = {
                                            "productQuantityBusinessReference": extractBusinessReference(channelProfile.productQuantityBusinessReferences, data)
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
                                    logError("Do UpdateProductQuantity Callback error - " + error, ncUtil);
                                    out.payload.error = { err: error };
                                    out.ncStatusCode = 400;
                                    callback(out);
                                }
                            } catch (err) {
                                logError("Exception occurred in UpdateProductQuantity - " + err, ncUtil);
                                out.ncStatusCode = 500;
                                out.payload.error = { err: err, stack: err.stackTrace };
                                callback(out);
                            }
                        });
                    } else if (response.statusCode == 429) {
                        out.ncStatusCode = 429;
                        out.payload.error = { err: read };
                        callback(out);
                    } else if (response.statusCode == 500) {
                        out.ncStatusCode = 500;
                        out.payload.error = { err: read };
                        callback(out);
                    } else {
                        out.ncStatusCode = 400;
                        out.payload.error = { err: read };
                        callback(out);
                    }
                } else {
                    logError("Do UpdateProductQuantity Callback error - " + error, ncUtil);
                    out.payload.error = error;
                    out.ncStatusCode = 400;
                    callback(out);
                }

            } catch (err) {
                logError("Exception occurred in UpdateProductQuantity - " + err, ncUtil);
                out.ncStatusCode = 500;
                out.payload.error = { err: err, stack: err.stackTrace };
                callback(out);
            }
        });
    } else {
        log("Callback with an invalid request - " + invalidMsg, ncUtil);
        out.ncStatusCode = 400;
        out.payload.error = { err: "Callback with an invalid request - " + invalidMsg };
        callback(out);
    }
};

function logError(msg, ncUtil) {
    console.log("[error] " + msg);
}

function log(msg, ncUtil) {
    console.log("[info] " + msg);
}

module.exports.UpdateProductQuantity = UpdateProductQuantity;
