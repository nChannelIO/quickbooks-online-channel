let GetCustomerFromQuery = function(ncUtil,
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
    } else if (!Array.isArray(channelProfile.customerBusinessReferences)) {
        invalid = true;
        invalidMsg = "channelProfile.customerBusinessReferences is not an array"
    } else if (channelProfile.customerBusinessReferences.length === 0) {
        invalid = true;
        invalidMsg = "channelProfile.customerBusinessReferences is empty"
    }

    //If a query document was not passed in, the request is invalid
    if (!payload) {
        invalid = true;
        invalidMsg = "payload was not provided"
    } else if (!payload.doc) {
        invalid = true;
        invalidMsg = "payload.doc was not provided";
    } else if (!payload.doc.remoteIDs && !payload.doc.searchFields && !payload.doc.modifiedDateRange) {
        invalid = true;
        invalidMsg = "either payload.doc.remoteIDs or payload.doc.searchFields or payload.doc.modifiedDateRange must be provided"
    } else if (payload.doc.remoteIDs && (payload.doc.searchFields || payload.doc.modifiedDateRange)) {
        invalid = true;
        invalidMsg = "only one of payload.doc.remoteIDs or payload.doc.searchFields or payload.doc.modifiedDateRange may be provided"
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
        invalidMsg = "startDateGMT must have a date before endDateGMT";
    }

    //If callback is not a function
    if (!callback) {
        throw new Error("A callback function was not provided");
    } else if (typeof callback !== 'function') {
        throw new TypeError("callback is not a function")
    }

    if (!invalid) {
        const extractBusinessReference = require('../../../../util/extractBusinessReference');

        let minorVersion = "?minorversion=" + channelProfile.channelSettingsValues.minor_version;

        let endPoint = "/company/" + channelProfile.channelAuthValues.realm_id + "/query" + minorVersion;

        let request = ncUtil.request;

        let url = channelProfile.channelSettingsValues.protocol + "://" + channelProfile.channelSettingsValues.api_uri + endPoint;

        /*
         Create query string for searching customers by specific fields
         */
        let queryParams = [];
        let filterParams = [];

        if (payload.doc.searchFields) {
            let fields = [];
            payload.doc.searchFields.forEach(function(searchField) {

                // Check fields to get the base property to use in the query
                if (searchField.searchField !== "MetaData.CreateTime" && searchField.searchField !== "MetaData.LastUpdatedTime") {
                  if (searchField.searchField === "PrimaryEmailAddr.Address") {
                    searchField.searchField = "PrimaryEmailAddr";
                  }
                }

                // Loop through each value
                let values = [];

                searchField.searchValues.forEach(function(searchValue) {
                    // The value for "Active" must be passed in as a boolean
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
        url += "&query=SELECT * FROM Customer WHERE " + queryParams.join(' ');

        log("Using URL [" + url + "]", ncUtil);

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

        try {
            // Pass in our URL and headers
            request(options, function(error, response, body) {

                if (!error) {
                    log("Do GetCustomerFromQuery Callback", ncUtil);
                    out.response.endpointStatusCode = response.statusCode;
                    out.response.endpointStatusMessage = response.statusMessage;

                    // Parse data
                    let docs = [];
                    let data = body;

                    if (response.statusCode === 200) {
                        // If we have an array of customers, set out.payload to be the array of customers returned
                        if (data.QueryResponse.Customer && data.QueryResponse.Customer.length > 0) {
                            for (let i = 0; i < data.QueryResponse.Customer.length; i++) {
                                let customer = data.QueryResponse.Customer[i];
                                docs.push({
                                    doc: customer,
                                    customerRemoteID: customer.Id,
                                    customerBusinessReference: extractBusinessReference(channelProfile.customerBusinessReferences, customer)
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
                    logError("Do GetCustomerFromQuery Callback error - " + error, ncUtil);
                    out.ncStatusCode = 500;
                    out.payload.error = {
                        err: error
                    };
                    callback(out);
                }
            });
        } catch (err) {
            logError("Exception occurred in GetCustomerFromQuery - " + err, ncUtil);
            out.ncStatusCode = 500;
            out.payload.error = {
                err: err,
                stack: err.stackTrace
            };
            callback(out);
        }
    } else {
        log("Callback with an invalid request - " + invalidMsg, ncUtil);
        out.ncStatusCode = 400;
        out.payload.error = invalidMsg;
        callback(out);
    }
};

function logError(msg, ncUtil) {
    console.log("[error] " + msg);
}

function log(msg, ncUtil) {
    console.log("[info] " + msg);
}

module.exports.GetCustomerFromQuery = GetCustomerFromQuery;
