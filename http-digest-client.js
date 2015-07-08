//
// # Digest Client
//
// Use together with HTTP Client to perform requests to servers protected
// by digest authentication.
//

var HTTPDigest = function () {
  var crypto = require('crypto');

  var HTTPDigest = function (username, password, https) {
    this.nc = 0;
    this.username = username;
    this.password = password;
    this.http = https ? require('https') : require('http');
  };

  //
  // ## Make request
  //
  // Wraps the http.request function to apply digest authorization.
  //
  HTTPDigest.prototype.request = function (options, sCallback, eCallback) {
    var self = this;

    //remove null and undefined headers
    var headers = options.headers;
    for (key in headers) {
      if(headers[key] === null || headers[key] === undefined)
        delete headers[key];
    };

    // delete options.protocol;
    var request = self.http.request(options, function (res) {
      self._handleResponse(options, res, sCallback);
    });

    if(typeof eCallback === 'function')
      request.on('error', eCallback)
    else request.on('error', function(err) {
      console.log(err)
    })

    request.end();
    return request;
  };

  //
  // ## Handle authentication
  //
  // Parse authentication headers and set response.
  //
  HTTPDigest.prototype._handleResponse = function handleResponse(options, res, callback) {
    var challenge = this._parseChallenge(res.headers['www-authenticate']);
    var ha1 = crypto.createHash('md5');
    ha1.update([this.username, challenge.realm, this.password].join(':'));
    var ha2 = crypto.createHash('md5');
    ha2.update([options.method, options.path].join(':'));

    // Generate cnonce
    var cnonce = false;
    var nc = false;
    if (typeof challenge.qop === 'string') {
      var cnonceHash = crypto.createHash('md5');
      cnonceHash.update(Math.random().toString(36));
      cnonce = cnonceHash.digest('hex').substr(0, 8);
      nc = this.updateNC();
    }

    // Generate response hash
    var response = crypto.createHash('md5');
    var responseParams = [
      ha1.digest('hex'),
      challenge.nonce
    ];

    if (cnonce) {
      responseParams.push(nc);
      responseParams.push(cnonce);
    }

    if(challenge.qop) responseParams.push(challenge.qop);
    responseParams.push(ha2.digest('hex'));
    response.update(responseParams.join(':'));

    // Setup response parameters
    var authParams = {
      username: this.username,
      realm: challenge.realm,
      nonce: challenge.nonce,
      uri: options.path,
      qop: challenge.qop,
      response: response.digest('hex'),
      opaque: challenge.opaque
    };
    if (cnonce) {
      authParams.nc = nc;
      authParams.cnonce = cnonce;
    }

    var headers = options.headers || {};
    headers.Authorization = this._compileParams(authParams);
    options.headers = headers;

    this.http.request(options, function (res) {
      callback(res);
    }).end();
  };

  //
  // ## Parse challenge digest
  //
  HTTPDigest.prototype._parseChallenge = function parseChallenge(digest) {
    if(!digest) return {};
    var prefix = "Digest ";
    var challenge = digest.substr(digest.indexOf(prefix) + prefix.length);
    var parts = challenge.split(',');
    var length = parts.length;
    var params = {};
    for (var i = 0; i < length; i++) {
      var part = parts[i].match(/^\s*?([a-zA-Z0-0]+)=?"(.*)?"\s*?$/);
      if (part && part.length > 2) {
        params[part[1]] = part[2];
      }
    }

    return params;
  };

  //
  // ## Compose authorization header
  //
  HTTPDigest.prototype._compileParams = function compileParams(params) {
    var parts = [];
    for (var i in params) {
      parts.push(i + '="' + params[i] + '"');
    }
    return 'Digest ' + parts.join(',');
  };

  //
  // ## Update and zero pad nc
  //
  HTTPDigest.prototype.updateNC = function updateNC() {
    var max = 99999999;
    this.nc++;
    if (this.nc > max) {
      this.nc = 1;
    }
    var padding = new Array(8).join('0') + "";
    var nc = this.nc + "";
    return padding.substr(0, 8 - nc.length) + nc;
  };

  // Return response handler
  return HTTPDigest;
}();

module.exports = HTTPDigest;
