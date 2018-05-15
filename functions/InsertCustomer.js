let InsertCustomer = function (ncUtil,
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

    //If channelProfile does not contain channelSettingsValues, channelAuthValues or customerBusinessReferences, the request can't be sent
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
    } else if (!channelProfile.customerBusinessReferences) {
        invalid = true;
        invalidMsg = "channelProfile.customerBusinessReferences was not provided"
    } else if (channelProfile.customerBusinessReferences.length === 0) {
        invalid = true;
        invalidMsg = "channelProfile.customerBusinessReferences is empty"
    }

    //If a customerAddressDocument was not passed in, the request is invalid
    if (!payload) {
        invalid = true;
        invalidMsg = "payload was not provided"
    } else if (!payload.doc) {
        invalid = true;
        invalidMsg = "payload.doc was not provided"
    }

    //If callback is not a function
    if (!callback) {
        throw new Error("A callback function was not provided");
    } else if (typeof callback !== 'function') {
        throw new TypeError("callback is not a function")
    }

    if (!invalid) {
        let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;
        let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/customer" + minorVersion;

        let request = ncUtil.request;

        url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

        /*
         Format url
         */
        let headers = {
            "Authorization": "Bearer " + channelProfile.channelAuthValues.access_token,
            "Accept": "application/json"
        };

        log("Using URL [" + url + "]", ncUtil);

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

        try {
            // Pass in our URL and headers
            request(options, function (error, response, body) {
                if (!error) {
                    const extractBusinessReference = require('../../../../util/extractBusinessReference');
                    log("Do InsertCustomer Callback", ncUtil);
                    out.response.endpointStatusCode = response.statusCode;
                    out.response.endpointStatusMessage = response.statusMessage;

                    // Parse data
                    let data = body;

                    // If we have a customer object, set out.payload.doc to be the customer document
                    if (data && response.statusCode == 200) {
                        out.payload = {
                            doc: data.Customer,
                            "customerRemoteID": data.Customer.Id,
                            "customerBusinessReference": extractBusinessReference(channelProfile.customerBusinessReferences, data.Customer)
                        };

                        out.ncStatusCode = 201;
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
                    logError("Do InsertCustomer Callback error - " + error, ncUtil);
                    out.ncStatusCode = 500;
                    out.payload.error = {err: error};
                    callback(out);
                }
            });
        } catch (err) {
            logError("Exception occurred in InsertCustomer - " + err, ncUtil);
            out.ncStatusCode = 500;
            out.payload.error = {err: err, stack: err.stackTrace};
            callback(out);
        }
    } else {
        log("Callback with an invalid request - " + invalidMsg, ncUtil);
        out.ncStatusCode = 400;
        out.payload.error = {err: invalidMsg};
        callback(out);
    }
};

function logError(msg, ncUtil) {
    console.log("[error] " + msg);
}

function log(msg, ncUtil) {
    console.log("[info] " + msg);
}

module.exports.InsertCustomer = InsertCustomer;
