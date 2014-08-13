var Stex    = require('stex');
var errors  = Stex.errors;
var _       = Stex._;
var Promise = Stex.Promise;

module.exports = Stex.new(__dirname + "/..", function(stex) {
  var router              = stex.router;
  var wallet              = require("./models/wallet");
  var loginFailureTracker = require("./models/login-failure-tracker");

  router.post('/wallets/show', function(req, res, next) {
    var id = (req.body.id || "").toString();

    if (_.isEmpty(id)) {
      res.send(400, {
        "status": "fail",
        "field":  "id",
        "code":   "missing"
      });
      return;
    }

    loginFailureTracker.isLoginAllowed(req.ip).then(function(isAllowed) {
      if(isAllowed) {
        actuallyLogin();
      } else {
        failSlow();
      }
    });

    function actuallyLogin() {
      wallet.get(id).then(function(wallet) {
        if(typeof wallet === "undefined") {
          //TODO: confirm this works well behind cloudflare
          loginFailureTracker.record(req.ip);
          fail();
        } else {
          res.send({
            "status" : "success",
            "data"   : _.omit(wallet, ['recoveryId', 'recoveryData'])
          });
        }
      });
    }

    function failSlow() {
      Promise.delay(loginFailureTracker.SLEEP_TIME).then(fail)
    }

    function fail() {
      res.send(404, { "status": "fail", "code": "not_found" });
    }
  });

  router.post('/wallets/create', function(req, res, next) {
    var walletToSubmit = _.pick(req.body, [
      'id',
      'authToken',
      'mainData',
      'mainDataHash',
      'keychainData',
      'keychainDataHash'
    ]);

    wallet.create(walletToSubmit)
      .then (function(wallet) { 
        res.send({"status" : "success"}); 
      })
      .catch(wallet.errors.InvalidHash, function(e) {
        res.send(400, {
          "status": "fail",
          "field":  e.field,
          "code":   "invalid_hash"
        });
      })
      .catch(errors.MissingField, function(e) {
        res.send(400, {
          "status": "fail",
          "field":  e.field,
          "code":   "missing"
        });
      })
      .catch(errors.DuplicateRecord, function(e) {
        res.send(400, {
          "status": "fail",
          "field":  "id",
          "code":   "already_taken"
        });
      })
      .catch(function(e) {
        next(e);
      });
  });

  router.post('/wallets/update', function(req, res, next) {
    var id        = req.body.id;
    var authToken = req.body.authToken;
    var changes   = _.pick(req.body, [
      'mainData',
      'mainDataHash',
      'keychainData',
      'keychainDataHash',
    ]);

    wallet.update(id, authToken, changes)
      .then (function(wallet) { 
        res.send({"status" : "success"}); 
      })
      .catch(errors.RecordNotFound, function(e) {
        res.send(404, {
          "status": "fail",
          "code":   "not_found"
        });
      })
      .catch(errors.Forbidden, function(e) {
        res.send(403, {
          "status": "fail",
          "code":   "forbidden"
        });
      })
      .catch(wallet.errors.InvalidHash, function(e) {
        res.send(400, {
          "status": "fail",
          "field":  e.field,
          "code":   "invalid_hash"
        });
      })
      .catch(function(e) {
        next(e);
      });
  });

  router.post('/wallets/replace', function(req, res, next) {
    var replaceArgs = _.at(req.body, 'oldId', 'oldAuthToken', 'newId', 'newAuthToken');

    wallet.replace.apply(null, replaceArgs)
      .then(function () {
        res.send({"status" : "success"}); 
      })
      .catch(errors.Forbidden, function(e) {
        res.send(403, {
          "status": "fail",
          "code":   "forbidden"
        });
      })
      .catch(errors.RecordNotFound, function(e) {
        res.send(404, {
          "status": "fail",
          "code":   "not_found"
        });
      })
      .catch(function(e) {
        next(e);
      });
  });

  router.post('/wallets/recover', function(req, res, next) {
    var recoveryId = req.body.recoveryId;

    if (_.isEmpty(recoveryId)) {
      res.send(400, {
        "status": "fail",
        "field":  "recoveryId",
        "code":   "missing"
      });
      return;
    }

    wallet.getByRecoveryId(recoveryId).then(function(wallet) {
      if(typeof wallet === "undefined") {
        res.send(404, { "status": "fail", "code": "not_found" });
      } else {
        res.send({
          "status" : "success",
          "data"   : wallet
        });
      }
    });
  });

  router.post('/wallets/create_recovery_data', function(req, res, next) {
    var id        = req.body.id;
    var authToken = req.body.authToken;
    var changes   = _.pick(req.body, [
      'recoveryId',
      'recoveryData',
      'recoveryDataHash'
    ]);

    wallet.createRecovery(id, authToken, changes)
      .then (function(wallet) {
        res.send({"status" : "success"});
      })
      .catch(errors.Forbidden, function(e) {
        res.send(403, {
          "status": "fail",
          "code":   "forbidden"
        });
      })
      .catch(wallet.errors.InvalidHash, function(e) {
        res.send(400, {
          "status": "fail",
          "field":  e.field,
          "code":   "invalid_hash"
        });
      })
      .catch(function(e) {
        next(e);
      });
  });
});