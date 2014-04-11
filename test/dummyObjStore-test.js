assert = require('assert');
ObjectDisp = require('../objectDisp.js');
DummyObjectStore = require('../dummyObjectStore.js');
var descObjectStore = require('./descObjectStore.js');

var disp = new ObjectDisp({
    MyClass: {
	init: function() { this.name = 'foo'; },
	patch1: function (ctx, patch) {
	    this._replaceWith = patch.rep;
	},
    },
    Counter: require('../counter.js')
});
var ostore = new DummyObjectStore(disp);
describe('DummyObjectStore', function(){
    descObjectStore(ostore);
});
