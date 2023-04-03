var https = require('https');
var params = require('./params');


var nrequest = 0;
var duration = 1;

process.argv.forEach(function (val, index, array) {
  nrequest = val.startsWith("--nb=") && /^\d+$/.test(val.slice(5)) ? val.slice(5) : nrequest;
  duration = val.startsWith("--time=") && /^\d+$/.test(val.slice(7)) ? val.slice(7) : duration;
});

var loop = nrequest / duration > 1 ? duration : nrequest;
var reqperloop = nrequest / duration > 1 ? Math.ceil(nrequest / duration ) : 1;
var interval = nrequest / duration > 1 ? 1 : Math.ceil( duration / nrequest );

console.log("will send "+ nrequest + " requests in " + duration + " secondes wich is "+reqperloop+" requests x" + loop + " times every " + interval +" sec");



var options = {
  protocol: 'https:',
  hostname: 'awonetuiph.execute-api.eu-west-3.amazonaws.com',
  port: 443,
  path: '/prod/orders',
  method: 'POST'
};



if(loop>0){
// write data to request body

sendRequest();

}




function getRandomInt (min, max) {
  return Math.round(Math.random() * (max - min + 1)) + min;
}


function sendRequest(){
  for (let i = 0; i < reqperloop; i++) {
  var req = https.request(options, function (res) {
    console.log('request sent -> STATUS: ' + res.statusCode);
   // console.log('HEADERS: ' + JSON.stringify(res.headers));
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      //console.log('BODY: ' + chunk);
    });
  });
  
  req.on('error', function (e) {
    console.log('problem with request: ' + e.message);
  });

  var stockId = Math.floor(Math.random()*params.companyNames.length);
  params.companyNames[stockId].startPrice = params.companyNames[stockId].startPrice + getRandomInt(-5,5) < 1 ? 1 : params.companyNames[stockId].startPrice + getRandomInt(-5,5) ;


  req.write(JSON.stringify({ 
    "stockname": params.companyNames[stockId].name,
    "from": params.fictiveNames[Math.floor(Math.random()*params.fictiveNames.length)],
    "qty": getRandomInt(1,5),
    "price": params.companyNames[stockId].startPrice
    }));
  req.end();
}
loop--;

if(loop>0){
  // write data to request body
  setTimeout(sendRequest, interval * 1000);
  }

}