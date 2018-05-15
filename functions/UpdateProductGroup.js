let UpdateProductGroup = function(
    ncUtil,
    channelProfile,
    flowContext,
    payload,
    callback)
{
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

    // Pass through
    out.ncStatusCode = 200;
    callback(out);
}
module.exports.UpdateProductGroup = UpdateProductGroup;
