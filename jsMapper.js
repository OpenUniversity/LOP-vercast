var util = require('./util.js');

exports.init = function(args, ctx) {
    ctx.ret(args);
};

exports.apply = function(state, patch, unapply, ctx) {
    util.depend([
	function(_) { ctx.unhash(state, _('mapper')); },
	function(_) { ctx.unhash(patch, _('patch')); },
	function(mapper, patch, _) {
	    function emit(p) {
		ctx.effect(p);
	    }
	    var methodName = unapply ? 'unmap' : 'map';
	    var map = eval('(' + mapper[methodName] + ')');
	    map.call(mapper, patch);
	    ctx.ret(state);
	},
    ], ctx.err);

};