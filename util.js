var crypto = require('crypto');

exports.protect = function(done, func) {
    return function(err) {
        if(err) return done(err);
        try {
            return func.apply(this, arguments);
        } catch(e) {
            return done(e);
        }
    }
}

exports.shouldFail = function(done, desc, func) {
    return function(err) {
        if(!err) {
            return done(new Error(desc));
        }
        try {
            return func.apply(this, arguments);
        } catch(e) {
            return done(e);
        }
    }
}

function funcCompose(f, g, obj) {
    var func = function() {
        f.call(obj, g);
    }
    return func;
}

exports.seq = function(funcs, done) {
    var obj = {};
    var f = done;
    var to = function() {
        var callback = this;
        var names = arguments;
        return function() {
            for(var i = 0; i < names.length; i++) {
                obj[names[i]] = arguments[i+1];
            }
            return callback.apply(obj, arguments);
        };
    };
    for(var i = funcs.length - 1; i >= 0; i--) {
        var newF = exports.protect(done, funcCompose(funcs[i], f, obj, []));
        newF.to = to;
        f = newF;
    }
    return f;
}

var MAX_UID = 0x100000000; // 36 bits
var seed = 0x1000;

exports.timeUid = function() {
    var time = (new Date()).getTime().toString(16);
    var uid = Math.floor((1 + Math.random()) * MAX_UID).toString(16);
    uid = uid.substr(1); // The first character is always '1'
    seed++;
    return time + seed + uid; // string concatenation
}


exports.Encoder = function(allowedSpecial) {
    if(allowedSpecial.length < 3) {
        throw new Error('at least three special characters must be allowed. Given: "' + allowedSpecial + '"');
    }
    function buildEscapedCharString(allowed) {
        var chars = '';
        for(var i = 0; i < 128; i++) {
            var c = String.fromCharCode(i);
            if(allowed.indexOf(c) == -1) {
                chars += c;
            }
        }
        return chars;
    }
    var regularChars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var allowed = regularChars + allowedSpecial.substr(0, allowedSpecial.length-1);
    var escapedChars = buildEscapedCharString(allowed);
    var esc = allowedSpecial.charAt(allowedSpecial.length - 1);

    this.encode = function(str) {
        var enc = '';
        for(var i = 0; i < str.length; i++) {
            var c = str.charAt(i);
            var index = escapedChars.indexOf(c);
            if(index != -1) {
                enc += esc + allowed.charAt(index);
            } else {
                enc += c;
            }
        }
        return enc;
    }
    
    this.decode = function(str) {
        var dec = '';
        for(var i = 0; i < str.length; i++) {
            var c = str.charAt(i);
            if(c == esc) {
                i++;
                c = str.charAt(i);
                dec += escapedChars.charAt(allowed.indexOf(c));
            } else {
                dec += c;
            }
        }
        return dec;
    }
    
};
exports.parallel = function(n, callback) {
    return function(err) {
        if(err) {
            n = -1;
            callback(err);
        }
        n--;
        if(n == 0) {
            callback();
        }
    }
};

exports.Worker = function(f, interval, maxInstances) {
    var lastTime = 0;
    var running = false;
    var numInstances = 0;
    this.start = function() {
        running = true;
        tick();
    };
    var tick = function() {
        var self = this;
        while(running) {
            var timeElapsed = (new Date()).getTime() - lastTime;
            if(timeElapsed < interval) {
                setTimeout(tick, interval - timeElapsed);
                break;
            }
            lastTime = (new Date()).getTime();
            if(!maxInstances || numInstances < maxInstances) {
                numInstances++;
                f(function(err) {
                    if(err) {
                        console.error(err.stack);
                    }
                    numInstances--;
                });
            }
        }
    };
    this.stop = function() {
        running = false;
    };
};

exports.httpJsonReq = function(method, URL, content, callback, headers) {
    var http = require('http');
    var url = require('url');
    var parsedURL = url.parse(URL);
    parsedURL.headers = headers || {};
    parsedURL.headers.host = parsedURL.host;
    if(content) {
	parsedURL.headers['content-type'] = 'application/json';
    }
    parsedURL.method = method;
    var request = http.request(parsedURL, function(resp) {
        var data = '';
        resp.setEncoding('utf8');
        resp.on('data', function(chunk) {
            data += chunk;
        });
        resp.on('end', exports.protect(function() {
            if(resp.statusCode >= 500) {
                callback(new Error('HTTP Error ' + resp.statusCode + ': ' + data));
            } else if(resp.headers['content-type'] == 'application/json') {
                callback(undefined, resp.statusCode, resp.headers, JSON.parse(data));
            } else {
		callback(undefined, resp.statusCode, resp.headers, data);
	    }
        }));
	resp.on('error', callback);
    });
    if(content) {
        request.end(JSON.stringify(content));
    } else {
        request.end();
    }
    request.on('error', callback);
};

exports.parsePath = function(path) {
    var splitPath = path.split('/');
    return {
        fileName: splitPath[splitPath.length - 1],
        dirPath: splitPath.slice(0, splitPath.length - 1).join('/') + '/'
    };
};

exports.createHashID = function(obj) {
    var hash = crypto.createHash('sha1');
    delete obj._id;
    hash.update(JSON.stringify(obj), 'utf8');
    obj._id = hash.digest('base64');
};

exports.TracingDispatcher = function(disp, name) {
    var baseTS = (new Date()).getTime();
    function ts() {
	return (new Date()).getTime() - baseTS;
    }
    this.transaction = function(trans, callback) {
	console.log(ts(), name, 'transaction:', trans);
	disp.transaction(trans, exports.protect(callback, function(err, result) {
	    console.log(ts(), name, 'result:', result);
	    callback(undefined, result);
	}));
    };
    this.dispatch = function(task, callback) {
	console.log(ts(), name, 'dispatch:', task);
	disp.dispatch(task, exports.protect(callback, function(err, tasks) {
	    console.log(ts(), name, 'tasks:', tasks);
	    callback(undefined, tasks);
	}));
    };
};

exports.repeat = function(times, resField, initial, loop, callback) {
    var seq = [];
    seq.push(function(_) { this[resField] = initial; _(); });
    for(var i = 0; i < times; i++) {
	seq.push(loopFunc(i));
    }
    seq.push(function(_) { callback.to(resField)(undefined, this[resField]); });
    exports.seq(seq, callback)();

    function loopFunc(i) {
	return function(_) { loop.call(this, _, i); };
    }
};

exports.depend = function(funcs, callback) {
    var ctx = {};
    var values = {};
    evaluateFuncs();

    function evaluateFuncs() {
	if(funcs.length == 0) {
	    return callback();
	}
	for(var i = funcs.length - 1; i >=0; i--) {
	    if(!funcs[i]) continue;
	    evaluateFunc(funcs[i], i);
	}
    }
    
    function evaluateFunc(func, i) {
	var args = getFuncArgs(func);
	var vals = [];
	for(var j = 0; j < args.length; j++) {
	    if(args[j] == '_') {
		vals.push(underscoreFunc());
	    } else {
		if(!(args[j] in values)) return;
		vals.push(values[args[j]]);
	    }
	}
	var f = funcs.splice(i, 1);
	try {
	    f[0].apply(ctx, vals);
	} catch(e) {
	    return callback(e);
	}
    }
    function underscoreFunc() {
	return function() {
	    var argNames = Array.prototype.slice.call(arguments, 0);
	    return function(err) {
		if(err) {
		    return callback(err);
		}
		for(var i = 0; i < argNames.length; i++) {
		    //console.log(argNames[i] + ' <- ' + arguments[i+1]);
		    values[argNames[i]] = arguments[i+1];
		}
		evaluateFuncs();
	    };
	};
    }

    function getFuncArgs(func) {
	var str = func.toString();
	str = str.match(/^[^(]*[(]([^)]*)[)]/)[1];
	return str.split(/,[ \t]*/);
    };
};