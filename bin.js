#!/usr/bin/env node
'use strict'

var fs = require('fs')
var path = require('path')
var util = require('util')
var mkdirp = require('mkdirp')
var read = require('read')
var userHome = require('user-home')
var opn = require('opn')
var TwitterPin = require('twitter-pin')
var debug = require('debug')('tweetcat')
var tweetcat = require('./')

var remote = process.argv[2]
var confFile = process.argv[3] ?
                 path.join(process.cwd(), process.argv[3]) :
                 path.join(userHome, '.config', 'tweetcat.json')

if (!remote) return error('Usage: tweetcat <username>')
if (remote === '--init') return init()
if (!fs.existsSync(confFile)) return error('ERROR: tweetcat not initialized! Run `tweetcat --init`')

debug('loading config file', confFile)
var conf = require(confFile)
debug('loaded conf', conf)

process.stdin.pipe(tweetcat(remote, conf)).pipe(process.stdout)

function init () {
  read({ prompt: 'Twitter Consumer Key:' }, function (err, key) {
    if (err) return error(err)

    read({ prompt: 'Twitter Consumer Secret:' }, function (err, secret) {
      if (err) return error(err)

      authorize(key, secret, function (err, conf) {
        if (err) return error(err)

        conf.consumerKey = key
        conf.consumerSecret = secret

        setConf(conf, function (err) {
          if (err) return error(err)
          console.log('tweetcat initialized - now run `tweetcat [username]`')
        })
      })
    })
  })
}

function setConf (conf, cb) {
  mkdirp(path.join(userHome, '.config'), function (err) {
    if (err) return cb(err)
    debug('writing config file', conf)
    fs.writeFile(confFile, JSON.stringify(conf), cb)
  })
}

function authorize (key, secret, cb) {
  debug('requesting auth url from twitter...')
  var twitterPin = TwitterPin(key, secret)
  twitterPin.getUrl(function (err, url) {
    if (err) return cb(err)
    debug('received auth url', url)
    opn(url, { wait: false }, function (err) {
      if (err) return cb(err)
      read({ prompt: 'pin:' }, function (err, pin) {
        if (err) return cb(err)
        debug('authorizing with pin %s', pin)
        twitterPin.authorize(pin, cb)
      })
    })
  })
}

function error (err) {
  if (!err) return
  if (util.isError(err)) console.error(err.message)
  else console.error(err)
  process.exit(1)
}
