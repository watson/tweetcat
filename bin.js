#!/usr/bin/env node
'use strict'

// Please don't misuse these - I would like to keep this module easy to use
// without requireing people to first create their own app om Twitter
var consumerKey = 'XncZh9GMO7nUOCtoNeD7HXRu8'
var consumerSecret = 'NTshMOR9ew0iLTSfnFcYhJxp9XOkilWRSnMVt9vmaDqmcRK3pY'

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

var argv = require('minimist')(process.argv.slice(2))

var remote = argv._[0]
var confFile = path.join(process.cwd(), argv.conf) ||
               path.join(userHome, '.config', 'tweetcat.json')

if (argv.init) return init()
if (!fs.existsSync(confFile)) return error('ERROR: tweetcat not initialized! Run `tweetcat --init`')
if (!remote) return error('Usage: tweetcat [username]')

debug('loading config file', confFile)
var conf = require(confFile)
conf.consumerKey = consumerKey
conf.consumerSecret = consumerSecret
conf.plain = argv.plain
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
