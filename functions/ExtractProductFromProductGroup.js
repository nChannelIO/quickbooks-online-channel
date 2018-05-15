let ExtractProductFromProductGroup = function(
    ncUtil,
    channelProfile,
    flowContext,
    payload,
    callback)
{

    log("Building callback object...", ncUtil);
    let out = {
        ncStatusCode: null,
        payload: {}
    };

    // Check callback
    if (!callback) {
        throw new Error("A callback function was not provided");
    } else if (typeof callback !== 'function') {
        throw new TypeError("callback is not a function")
    }

    try {
        let notFound = false;
        let invalid = false;
        let invalidMsg = "";
        let data = {};

        // Check ncUtil
        if (!ncUtil) {
            invalid = true;
            invalidMsg = "ExtractProductFromProductGroup - Invalid Request: ncUtil was not passed into the function";
        }

        // Check Payload
        if (payload) {
            if (!payload.doc) {
                invalidMsg = "Extract Product From Product Group - Invalid Request: payload.doc was not provided";
                invalid = true;
            } else if (!payload.doc.Items || payload.doc.Items.length === 0) {
                notFound = true;
                invalidMsg = "Extract Product From Product Group - Products Not Found: There are no products to extract (payload.doc.Items)";
            } else {
                data = payload.doc.Items;
            }
        } else {
            invalidMsg = "Extract Product From Product Group - Invalid Request: payload was not provided";
            invalid = true;
        }

        if (!invalid && !notFound) {
            // Products Found
            out.payload = [];

            data.forEach((product) => {
                out.payload.push({ doc: product });
            });

            out.ncStatusCode = 200;

            callback(out);
        } else if (!invalid && notFound){
            // Products Not Found
            log(invalidMsg, ncUtil);
            out.ncStatusCode = 204;
            callback(out);
        } else {
            // Invalid Request (payload, payload.doc, or payload.doc.Items was not passed in)
            log(invalidMsg, ncUtil);
            out.ncStatusCode = 400;
            out.payload.error = { err: invalidMsg };
            callback(out);
        }
    }
    catch (err){
        logError("Exception occurred in ExtractProductFromProductGroup - " + err, ncUtil);
        out.ncStatusCode = 500;
        out.payload.error = { err: err.message, stackTrace: err.stackTrace };
        callback(out);
    }

}

function logError(msg, ncUtil) {
    console.log("[error] " + msg);
}

function log(msg, ncUtil) {
    console.log("[info] " + msg);
}
module.exports.ExtractProductFromProductGroup = ExtractProductFromProductGroup;
