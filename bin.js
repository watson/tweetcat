#!/usr/bin/env node
'use strict'

// TODO: What to do with these?
var consumerKey = 'JyquwWU20k5R9OnGxqVQ22WpZ'
var consumerSecret = '2lsWPGMjlkjRrH76e3dJdzNsxdxRHldY6XqnnXcNqhpE6mvEXR'

var fs = require('fs')
var path = require('path')
var util = require('util')
var mkdirp = require('mkdirp')
var read = require('read')
var userHome = require('user-home')
var opn = require('opn')
var twitterPin = require('twitter-pin')(consumerKey, consumerSecret)
var debug = require('debug')('tweetcat')
var tweetcat = require('./')

var remote = process.argv[2]
var confFile = process.argv[3] || path.join(userHome, '.config', 'tweetcat.json')

if (!remote) return error('Usage: tweetcat [username]')
if (remote === '--init') return init()
if (!fs.existsSync(confFile)) return error('ERROR: tweetcat not initialized! Run `tweetcat --init`')

debug('loading config file', confFile)
var conf = require(confFile)
conf.consumerKey = consumerKey
conf.consumerSecret = consumerSecret
debug('loaded conf', conf)

process.stdin.pipe(tweetcat(remote, conf)).pipe(process.stdout)

function init () {
  authorize(function (err, conf) {
    if (err) return error(err)
    setConf(conf, function (err) {
      if (err) return error(err)
      console.log('tweetcat initialized - now run `tweetcat [username]`')
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

function authorize (cb) {
  debug('requesting auth url from twitter...')
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
