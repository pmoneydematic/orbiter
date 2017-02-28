var mongoose = require( 'mongoose' );
require( '../db-internal.js' );
mongoose.Promise = global.Promise;

var Block     = mongoose.model( 'Block' );
var InternalTx     = mongoose.model( 'InternalTransaction' );
var Transaction     = mongoose.model( 'Transaction' );

var filters = require('./filters')


var async = require('async');

module.exports = function(app){
  var web3relay = require('./web3relay');

  var DAO = require('./dao');

  var compile = require('./compiler');
  var fiat = require('./fiat');
  var stats = require('./stats');

  /*
    Local DB: data request format
    { "address": "0x1234blah", "txin": true }
    { "tx": "0x1234blah" }
    { "block": "1234" }
  */
  app.post('/addr', getAddr);
  app.post('/txcount', getTxCount);
  app.post('/internal', getInternalTx);
  app.post('/top', getTopTx);
  app.post('/low', getLowTx);

  app.post('/tx', getTx);
  app.post('/block', getBlock);
  app.post('/data', getData);

  app.post('/web3relay', web3relay.data);
  app.post('/compile', compile);

  app.post('/fiat', fiat);
  app.post('/stats', stats);
  
  app.post('/allaccounts', getAllAccounts);

}

var getTxCount = function(req, res){
  var addr = req.body.addr.toLowerCase();
  var data = { count: 0 };

  var addrTxCount = Transaction.find( { $or: [{"to": addr}, {"from": addr}] });
  addrTxCount.exec(function (err, results) {
    data.count = results.length;
    res.write(JSON.stringify(data));
    res.end();
  });
}


var getAddr = function(req, res){
  // TODO: validate addr and tx
  var addr = req.body.addr.toLowerCase();
  var count = parseInt(req.body.count);

  var limit = parseInt(req.body.length);
  var start = parseInt(req.body.start);


  var addrFind = Transaction.find( { $or: [{"to": addr}, {"from": addr}] });
  var data = { draw: "hi", recordsFiltered: count, recordsTotal: count };

  addrFind.lean(true).sort('-blockNumber').skip(start).limit(limit)
          .exec("find", function (err, docs) {
            if (docs){
              data.data = filters.filterTX(docs, addr);
              data.recordsTotal= docs.length;
              }
            else
              data.data = [];
            res.write(JSON.stringify(data));
            res.end();
          });


};



var getBlock = function(req, res) {

  // TODO: support queries for block hash
  var txQuery = "number";
  var number = parseInt(req.body.block);

  var blockFind = Block.findOne( { number : number }).lean(true);
  blockFind.exec(function (err, doc) {
    if (err || !doc) {
      console.error("BlockFind error: " + err)
      console.error(req.body);
      res.write(JSON.stringify({"error": true}));
    } else {
      var block = filters.filterBlocks([doc]);
      res.write(JSON.stringify(block[0]));
    }
    res.end();
  });

};

var getTx = function(req, res){

  var tx = req.body.tx.toLowerCase();
  console.log("findinging: " +tx)

  var txFind = Transaction.findOne( { "hash" : tx }, "hash value blockNumber timestamp gas gasUsed gasPrice input nonce from to creates")
                  .lean(true);
  txFind.exec(function (err, doc) {
    if (!doc){
      console.log("missing: " +tx)
      res.write(JSON.stringify({}));
      res.end();
    } else {

      if(!doc.to) doc.to = doc.creates;
      console.log(doc);
      var count = 10;
      var data = [];
      // try to find internal tx
      var txFind = InternalTx.find( {"transactionHash" : tx, "subtraces":0})
                      .lean(true).sort('-blockNumber')

      async.parallel([
        function(cb) {
          if (count) {
            data.recordsFiltered = parseInt(count);
            data.recordsTotal = parseInt(count);
            cb();
            return;
          }
          InternalTx.find( {"transactionHash" : tx, "subtraces":0})
                    .count(function(err, count) {
                        data.recordsFiltered = count;
                        data.recordsTotal = count;
                        cb()
                      });
        }, function(cb) {
          txFind.exec("find", function (err, docs) {
            if (docs){
              for(var i=0; i<docs.length; i++)
               docs[i].action.value = filters.calEth(docs[i].action.value );
               // if there's no internal tx or same to the contract address, no need to record it
              if ( docs.length ==1 && (doc.to == docs[0].action.to))
                doc.itx = []
              else
                doc.itx = docs
              doc.value = filters.calEth(doc.value);
              //console.log("result" + JSON.stringify(doc));
              res.write(JSON.stringify(doc));
              res.end();
            }
            else
              doc.itx = [];
            cb();
          });
        }

        ], function(err, results) {
              if (err) console.error(err);
        })
      // filter transactions
      //var txDocs = filters.filterBlock(doc, "hash", tx)

    }
  });

};

var getInternalTx = function(req, res){

  var addr = req.body.addr.toLowerCase();
  var limit = parseInt(req.body.length);
  var start = parseInt(req.body.start);

  var count = req.body.count;

  var data = { draw: parseInt(req.body.draw) };


  var txFind = InternalTx.find( { "action.callType" : "0",
                  $or: [{"action.from": addr}, {"action.to": addr}] })
                  .lean(true).sort('-blockNumber').skip(start).limit(limit)

  async.parallel([
    function(cb) {
      if (count) {
        data.recordsFiltered = parseInt(count);
        data.recordsTotal = parseInt(count);
        cb();
        return;
      }
      InternalTx.find( { "action.callType" : "0",
                  $or: [{"action.from": addr}, {"action.to": addr}] })
                .count(function(err, count) {
                    data.recordsFiltered = count;
                    data.recordsTotal = count;
                    cb()
                  });
    }, function(cb) {
      txFind.exec("find", function (err, docs) {
        if (docs)
          data.data = filters.internalTX(docs);
        else
          data.data = [];
        cb();
      });
    }

    ], function(err, results) {
      if (err) console.error(err);
      res.write(JSON.stringify(data));
      res.end();
    })

};

var getTopTx = function(req, res){

  var addr = req.body.addr.toLowerCase();
  var limit = parseInt(req.body.length);
  var start = parseInt(req.body.start);

  var count = req.body.count;

  var data = { draw: parseInt(req.body.draw) };


  var txFind = Transaction.find( { $or: [{"to": addr}, {"from": addr}] })
                  .lean(true).sort('-blockNumber').skip(start).limit(limit)

  async.parallel([
    function(cb) {
      if (count) {
        data.recordsFiltered = parseInt(count);
        data.recordsTotal = parseInt(count);
        cb();
        return;
      }
      Transaction.find( { $or: [{"to": addr}, {"from": addr}]})
                .count(function(err, count) {
                    data.recordsFiltered = count;
                    data.recordsTotal = count;
                    cb()
                  });
    }, function(cb) {
      txFind.exec("find", function (err, docs) {
        if (docs)
          data.data = docs;
        else
          data.data = [];
        cb();
      });
    }

    ], function(err, results) {
      if (err) console.error(err);
      res.write(JSON.stringify(data));
      res.end();
    })

};


var getLowTx = function(req, res){

  var addr = req.body.addr.toLowerCase();
  var limit = parseInt(req.body.length);
  var start = parseInt(req.body.start);

  var count = req.body.count;

  var data = { draw: parseInt(req.body.draw) };


  var txFind = InternalTx.find( { "action.callType" : "0",
                  $or: [{"action.from": addr}, {"action.to": addr}] })
                  .lean(true).sort('-blockNumber').skip(start).limit(limit)

  async.parallel([
    function(cb) {
      if (count) {
        data.recordsFiltered = parseInt(count);
        data.recordsTotal = parseInt(count);
        cb();
        return;
      }
      InternalTx.find( { "action.callType" : "0",
                  $or: [{"action.from": addr}, {"action.to": addr}] })
                .count(function(err, count) {
                    data.recordsFiltered = count;
                    data.recordsTotal = count;
                    cb()
                  });
    }, function(cb) {
      txFind.exec("find", function (err, docs) {
        if (docs)
          data.data = docs;
        else
          data.data = [];
        cb();
      });
    }

    ], function(err, results) {
      if (err) console.error(err);
      res.write(JSON.stringify(data));
      res.end();
    })

};


var getAllAccounts = function(req, res){
  //var addr = req.body.addr.toLowerCase(); // nothing should be sent in the request
  var accounts = [];
  
  // testing
  accounts.push("MC1234");
  accounts.push("MC5678");
  accounts.push("MC9098");
  accounts.push("MC7654");
  accounts.push("MC7654");
  accounts.push("MC1234567890");
  accounts.push("MC7654");
  accounts.push("MC9999");
  accounts.push("MC7654");
  accounts.push("MC9998");
  
  
  var lastBlock = latestBlock(); // this errors out the app.js when no nodes are present
  var txnsInBlock = lastBlock ? lastBlock.txns : 0;
  var txIndex = 0;
  if (lastBlock && lastBlock != "") {
    accounts.push(lastBlock.number);

  }
  else {
    accounts.push("No block found");
  }
  /*
  for(var idx = 0; idx < txnsInBlock; iodx++)
  {

    var txData = web3.eth.getTransactionFromBlock(lastBlock.number, txIndex); // gets transaction INDEX from the block (0)
    accounts.push(txData.from);
    accounts.push(txData.to);
  }*/

  

  // if you are using nodejs, you may need several calls to getBlock, getTransactionFromBlock,  to collect all addresses 
  // now return these addresses, and then do the web3relay call to get balances on them all in the controller
  // QUESTION: are all accounts/transactions stored in each block? or do i need to get EVERY block??

  /*
  var addrTxCount = Transaction.find( { $or: [{"to": addr}, {"from": addr}] });
  addrTxCount.exec(function (err, results) {
    data.count = results.length;    
  });
  */

  // Rturn only distinct accounts
  let uniqueAccts = Array.from( new Set(accounts) ); 

  // Return the data
  res.write(JSON.stringify(uniqueAccts));
  res.end();
}


/*
  Fetch data from DB
*/
var getData = function(req, res){

  // TODO: error handling for invalid calls
  var action = req.body.action.toLowerCase();
  var limit = req.body.limit

  if (action in DATA_ACTIONS) {
    if (isNaN(limit))
      var lim = MAX_ENTRIES;
    else
      var lim = parseInt(limit);

    DATA_ACTIONS[action](lim, res);

  } else {

    console.error("Invalid Request: " + action)
    res.status(400).send();
  }

};

/*
  temporary blockstats here
*/
var latestBlock = function(req, res) {
  var block = Block.findOne({}, "totalDifficulty")
                      .lean(true).sort('-number');
  block.exec(function (err, doc) {
    if (doc) { 
      res.write(JSON.stringify(doc));
      res.end();
    }    
    
  });
}


var getLatest = function(lim, res, callback) {
  var blockFind = Block.find({}, "number timestamp miner extraData txns")
                      .lean(true).sort('-number').limit(lim);
  blockFind.exec(function (err, docs) {
    callback(docs, res);
  });
}

/* get blocks from db */
var sendBlocks = function(lim, res) {
  var blockFind = Block.find({}, "number timestamp miner extraData txns")
                      .lean(true).sort('-number').limit(lim);
  blockFind.exec(function (err, docs) {
    res.write(JSON.stringify({"blocks": filters.filterBlocks(docs)}));
    res.end();
  });
}

var sendTxs = function(lim, res) {
  Transaction.find({}, "hash value blockNumber timestamp gas gasPrice input nonce from to").lean(true).sort('-blockNumber').limit(lim)
        .exec(function (err, txs) {
          res.write(JSON.stringify({"txs":  filters.filterTX2(txs)}));
          //res.write(JSON.stringify({"txs":  txs}));
          res.end();
        });
}

const MAX_ENTRIES = 10;

const DATA_ACTIONS = {
  "latest_blocks": sendBlocks,
  "latest_txs": sendTxs
}
