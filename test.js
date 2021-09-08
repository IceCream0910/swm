var request = require('request');
var http = require('http');
var fs = require('fs');

const PORT = process.env.PORT || 3000;


http.createServer(function(req, res) {
    var x = request('http://www.youtube.com/embed/XGSy3_Czz8k')
    req.pipe(x)
    x.pipe(res)
}).listen(PORT, null, () => console.log("Listening on port " + PORT));