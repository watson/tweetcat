'use strict'

var util = require('util')
var through2 = require('through2')
var duplexify = require('duplexify')
var Twit = require('twit')
var debug = require('debug')('tweetcat')

var handshakeTmpl = '@%s want to tweetcat?'

module.exports = function (remote, opts) {
  var incomingHandshake = new RegExp('^' + util.format(handshakeTmpl, opts.screen_name))
  var incomingMention = new RegExp('^@' + opts.screen_name + ' ')
  var twit = new Twit({
    consumer_key: opts.consumerKey,
    consumer_secret: opts.consumerSecret,
    access_token: opts.token,
    access_token_secret: opts.secret
  })
  var ws = through2()
  var rs = through2()
  var remoteId, lastMsgId

  getUserId(remote, function (err, id) {
    if (err) return rs.destroy(err)

    remoteId = id

    debug('listening for tweets by %s', remote)
    twit
      .stream('statuses/filter', { follow: remoteId })
      .on('tweet', ontweet)

    ws.on('data', function (data) {
      // TODO: What if a data isn't a complete line?
      var data = data.toString().trim()
      debug('received data on stream', data)

      var msg = util.format('@%s %s', remote, data)
      var send = function () {
        // send encoded tweet from readable stream
        sendTweet(msg, { in_reply_to_status_id: lastMsgId }, function (err) {
          if (err) rs.destroy(err)
        })
      }

      // TODO: What if a 2nd meesage comes in before the handshake have completed?
      if (lastMsgId) return send()

      handshake(function (err, id) {
        if (err) return rs.destroy(err)
        debug('handshake complete (id: %s, connected: true)', id)
        send()
      })
    })
  })

  function getUserId (username, cb) {
    debug('requesting user id for %s', username)
    twit.get('users/show', { screen_name: username }, function (err, data, res) {
      if (err) return cb(err)
      debug('got user id %s for username %s', data.id_str, username)
      cb(null, data.id_str)
    })
  }

  function ontweet (tweet) {
    debug('incoming tweet (id: %s, from: %s, connected: %s)', tweet.id_str, tweet.user.id_str, !!lastMsgId, tweet.text)

    // ignore tweets not created by the remote user (e.g. replies to the user, retweets etc)
    if (tweet.user.id_str !== remoteId) {
      debug('ignoring tweet not created by remote user (remote: %s, tweet: %s)', remoteId, tweet.user.id_str)
      return
    }

    // debug('new tweet from %s (id: %s, connected: %s)', remote, tweet.id_str, !!lastMsgId, tweet.text)

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

    if (incomingHandshake.test(tweet.text)) {
      debug('detected incoming handshake (id: %s, connected: true)', tweet.id_str)
      lastMsgId = tweet.id_str
      return
    }

    // ignore every tweet until connected
    if (!lastMsgId) {
      debug('ignoring tweet - no handshake sent or received yet!')
      return
    }

    lastMsgId = tweet.id_str
    var msg = tweet.text.replace(incomingMention, '')

    debug('received incoming message (id: %s)', tweet.id_str, msg)

    // TODO: Handle back pressure
    rs.write(msg + '\n') // write decoded message to writable stream
  }

  function handshake (cb) {
    debug('preparing handshake...')
    sendTweet(util.format(handshakeTmpl, remote, Date.now()), cb)
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
