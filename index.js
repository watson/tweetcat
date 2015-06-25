'use strict'

var util = require('util')
var through2 = require('through2')
var duplexify = require('duplexify')
var Twit = require('twit')
var debug = require('debug')('tweetcat')

var synTmpl = '@%s want to tweetcat?'
var synAckTmpl = '@%s yes let\'s tweetcat!'

module.exports = function (remote, opts) {
  var incomingSyn = new RegExp('^' + util.format(synTmpl, opts.screen_name))
  var incomingSynAck = new RegExp('^' + util.format(synAckTmpl, opts.screen_name))
  var incomingMention = new RegExp('^@' + opts.screen_name + ' ')
  var twit = new Twit({
    consumer_key: opts.consumerKey,
    consumer_secret: opts.consumerSecret,
    access_token: opts.token,
    access_token_secret: opts.secret
  })
  var proxy = duplexify()
  var rs = through2()
  var maxChunkSize = 140 - opts.screen_name.length - 2
  var synSent = false
  var remoteId, lastTweetId

  proxy.setReadable(rs)

  getUserId(remote, function (err, id) {
    if (err) return rs.destroy(err)

    remoteId = id

    debug('listening for tweets by %s', remote)
    twit
      .stream('statuses/filter', { follow: remoteId })
      .on('connected', syn) // TODO: Sub-optimal: This event doesn't fire for about 10 sec even though there is a connection
      .on('tweet', ontweet)
  })

  function getUserId (username, cb) {
    debug('requesting user id for %s', username)
    twit.get('users/show', { screen_name: username }, function (err, data, res) {
      if (err) return cb(err)
      debug('got user id %s for %s', data.id_str, username)
      cb(null, data.id_str)
    })
  }

  function ontweet (tweet) {
    // ignore tweets not created by the remote user (e.g. replies to the user, retweets etc)
    if (tweet.user.id_str !== remoteId) return

    // ignore all tweets not directed to the current user
    if (!incomingMention.test(tweet.text)) {
      // We could just use `tweet.in_reply_to_user_id_str`, but that will not be
      // set to the current user if the remote user replies to one of his own
      // tweets. In that case we could of cause check if the
      // `tweet.in_reply_to_user_id_str` was set to either the current OR the
      // remote user id, but then we would also have to check that there were an
      // @-mention to insure the reply to his own message wasn't to a totally
      // differnt user - so it's easier to just not care about
      // `tweet.in_reply_to_user_id_str` and ONLY care about the @-mention.
      debug('ignoring non-reply tweet (id: %s, reply-to: %s)', tweet.id_str, tweet.in_reply_to_user_id_str)
      return
    }

    // The remote is trying to establish a connection
    if (incomingSyn.test(tweet.text)) {
      debug('detected incoming syn pkg (id: %s)', tweet.id_str)
      lastTweetId = tweet.id_str
      synAck()
      return
    }

    // The remote is responding to a connection this client tried to establish
    if (incomingSynAck.test(tweet.text)) {
      debug('detected incoming syn-ack pkg (id: %s)', tweet.id_str)
      lastTweetId = tweet.id_str
      setWritable()
      return
    }

    debug('new tweet by %s (id: %s)', remote, tweet.id_str, tweet.text)

    if (!proxy._writable) return debug('ignoring tweet - not yet connected!')

    lastTweetId = tweet.id_str
    var data = tweet.text.replace(incomingMention, '')
    data = new Buffer(data, 'base64').toString('utf8')

    debug('relaying data (id: %s)', tweet.id_str, data)

    rs.write(data) // TODO: Handle back pressure
  }

  function setWritable () {
    if (proxy._writable) return // no need to do this more than once
    debug('connected')
    proxy.setWritable(through2(function (chunk, encoding, cb) {
      debug('received data on stream', chunk)
      sendData(chunk, function (err) {
        if (err) rs.destroy(err)
        cb()
      })
    }))
  }

  function sendData (buf, cb) {
    var rest = new Buffer('')
    var encoded = buf.toString('base64')

    while (encoded.length > maxChunkSize) {
      rest = Buffer.concat([buf.slice(-1), rest])
      buf = buf.slice(0, -1)
      encoded = buf.toString('base64')
    }

    var tweet = util.format('@%s %s', remote, encoded)

    sendTweet(tweet, { in_reply_to_status_id: lastTweetId }, function (err) {
      if (err) return cb(err)
      if (rest.length) return sendData(rest, cb)
      cb()
    })
  }

  function syn () {
    if (synSent) return
    synSent = true
    debug('preparing syn pkg...')
    var tweet = util.format(synTmpl, remote, Date.now())
    sendTweet(tweet, function (err, id) {
      if (err) return rs.destroy(err)
      debug('syn pkg sent successfully (id: %s)', id)
    })
  }

  function synAck () {
    debug('preparing syn-ack pkg...')
    var tweet = util.format(synAckTmpl, remote, Date.now())
    sendTweet(tweet, { in_reply_to_user_id_str: lastTweetId }, function (err, id) {
      if (err) return rs.destroy(err)
      debug('syn-ack pkg sent successfully (id: %s)', id)
      setWritable()
    })
  }

  function sendTweet (msg, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    opts.status = msg
    debug('tweeting', opts)
    twit.post('statuses/update', opts, function (err, data, res) {
      if (err) return cb(err)
      debug('tweet sent successfully (id: %s)', data.id_str)
      lastTweetId = data.id_str
      cb(null, data.id_str)
    })
  }

  return proxy
}
