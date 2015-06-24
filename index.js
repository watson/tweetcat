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
  var ws = through2()
  var rs = through2()
  var buffer = []
  var synSent = false
  var connected = false
  var remoteId, lastMsgId

  getUserId(remote, function (err, id) {
    if (err) return rs.destroy(err)

    remoteId = id

    debug('listening for tweets by %s', remote)
    twit
      .stream('statuses/filter', { follow: remoteId })
      .on('connected', syn) // TODO: Sub-optimal: This event doesn't fire for about 10 sec even though there is a connection
      .on('tweet', ontweet)

    ws.on('data', ondata)
  })

  function getUserId (username, cb) {
    debug('requesting user id for %s', username)
    twit.get('users/show', { screen_name: username }, function (err, data, res) {
      if (err) return cb(err)
      debug('got user id %s for username %s', data.id_str, username)
      cb(null, data.id_str)
    })
  }

  function ondata (data) {
    var data = data.toString().trim()
    debug('received data on stream', data)

    // TODO: Implement back pressure
    buffer.push(data)

    if (!connected) return syn()

    sendBuffer()
  }

  function ontweet (tweet) {
    debug('incoming tweet (id: %s, from: %s, connected: %s)', tweet.id_str, tweet.user.id_str, connected, tweet.text)

    // ignore tweets not created by the remote user (e.g. replies to the user, retweets etc)
    if (tweet.user.id_str !== remoteId) {
      debug('ignoring tweet not created by remote user (remote: %s, tweeter: %s)', remoteId, tweet.user.id_str)
      return
    }

    // debug('new tweet from %s (id: %s, connected: %s)', remote, tweet.id_str, connected, tweet.text)

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
      debug('ignoring tweet in reply to %s (id: %s)', tweet.in_reply_to_user_id_str, tweet.id_str)
      return
    }

    // The remote is trying to establish a connection
    if (incomingSyn.test(tweet.text)) {
      debug('detected incoming syn pkg (id: %s, connected: %s)', tweet.id_str, connected)
      lastMsgId = tweet.id_str
      synAck()
      return
    }

    // The remote is responding to a connection this client tried to establish
    if (incomingSynAck.test(tweet.text)) {
      debug('detected incoming syn-ack pkg (id: %s, connected: %s)', tweet.id_str, connected)
      lastMsgId = tweet.id_str
      connected = true
      sendBuffer()
      return
    }

    // ignore every tweet until connected
    if (!connected) {
      debug('ignoring tweet - not yet connected!')
      return
    }

    lastMsgId = tweet.id_str
    var msg = tweet.text.replace(incomingMention, '')

    debug('received incoming message (id: %s)', tweet.id_str, msg)

    // TODO: Handle back pressure
    rs.write(msg + '\n') // write decoded message to writable stream
  }

  function sendBuffer () {
    // TODO: Handle raise condition
    var data = buffer.shift()
    if (!data) return
    var msg = util.format('@%s %s', remote, data)
    // send encoded tweet from readable stream
    sendTweet(msg, { in_reply_to_status_id: lastMsgId }, function (err) {
      if (err) return rs.destroy(err)
      sendBuffer()
    })
  }

  function syn () {
    if (synSent) return
    synSent = true
    debug('preparing syn pkg...')
    sendTweet(util.format(synTmpl, remote, Date.now()), function (err, id) {
      if (err) return rs.destroy(err)
      debug('syn pkg sent successfully (id: %s, connected: %s)', id, connected)
    })
  }

  function synAck () {
    debug('preparing syn-ack pkg...')
    sendTweet(util.format(synAckTmpl, remote, Date.now()), function (err, id) {
      if (err) return rs.destroy(err)
      debug('syn-ack pkg sent successfully (id: %s, connected: %s)', id, connected)
      connected = true
      sendBuffer()
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
      lastMsgId = data.id_str
      cb(null, data.id_str)
    })
  }

  return duplexify(ws, rs)
}
