'use strict'

var util = require('util')
var through2 = require('through2')
var duplexify = require('duplexify')
var Twit = require('twit')
var debug = require('debug')('tweetcat')

var handshakeTmpl = '@%s want to tweetcat?'

module.exports = function (remote, opts) {
  var tweetcat = new Tweetcat(remote, opts)
  return duplexify(tweetcat.ws, tweetcat.rs)
}

var Tweetcat = function (remote, opts) {
  if (!(this instanceof Tweetcat)) return new Tweetcat(remote, opts)

  this._remote = remote
  this._incomingHandshake = new RegExp('^' + util.format(handshakeTmpl, opts.screen_name))
  this._incomingMention = new RegExp('^@' + opts.screen_name + ' ')
  this._twit = new Twit({
    consumer_key: opts.consumerKey,
    consumer_secret: opts.consumerSecret,
    access_token: opts.token,
    access_token_secret: opts.secret
  })
  this.ws = through2()
  this.rs = through2()

  this._getUserId(this._remote, function (err, remoteId) {
    if (err) return this.rs.destroy(err)

    this._remoteId = remoteId

    debug('listening for tweets by %s', this._remote)
    this._twit
      .stream('statuses/filter', { follow: remoteId })
      .on('tweet', this._ontweet.bind(this))

    this.ws.on('data', function (data) {
      // TODO: What if a data isn't a complete line?
      var data = data.toString().trim()
      debug('received data on stream', data)

      var msg = util.format('@%s %s', this._remote, data)
      var send = function () {
        // send encoded tweet from readable stream
        this._sendTweet(msg, { in_reply_to_status_id: this._lastMsgId }, function (err) {
          if (err) this.rs.destroy(err)
        }.bind(this))
      }.bind(this)

      // TODO: What if a 2nd meesage comes in before the handshake have completed?
      if (this._lastMsgId) return send()

      this._handshake(function (err, id) {
        if (err) return this.rs.destroy(err)
        debug('handshake complete (id: %s, connected: true)', id)
        send()
      }.bind(this))
    }.bind(this))
  }.bind(this))
}

Tweetcat.prototype._ontweet = function (tweet) {
  debug('incoming tweet (id: %s, from: %s, connected: %s)', tweet.id_str, tweet.user.id_str, !!this._lastMsgId, tweet.text)

  // ignore tweets not created by the remote user (e.g. replies to the user, retweets etc)
  if (tweet.user.id_str !== this._remoteId) {
    debug('ignoring tweet not created by remote user (remote: %s, tweet: %s)', this._remoteId, tweet.user.id_str)
    return
  }

  // debug('new tweet from %s (id: %s, connected: %s)', this._remote, tweet.id_str, !!this._lastMsgId, tweet.text)

  // ignore all tweets not directed to the current user
  if (!this._incomingMention.test(tweet.text)) {
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

  if (this._incomingHandshake.test(tweet.text)) {
    debug('detected incoming handshake (id: %s, connected: true)', tweet.id_str)
    this._lastMsgId = tweet.id_str
    return
  }

  // ignore every tweet until connected
  if (!this._lastMsgId) {
    debug('ignoring tweet - no handshake sent or received yet!')
    return
  }

  this._lastMsgId = tweet.id_str
  var msg = tweet.text.replace(this._incomingMention, '')

  debug('received incoming message (id: %s)', tweet.id_str, msg)

  // TODO: Handle backpressure
  this.rs.write(msg + '\n') // write decoded message to writable stream
}

Tweetcat.prototype._getUserId = function (username, cb) {
  debug('requesting user id for %s', username)
  this._twit.get('users/show', { screen_name: username }, function (err, data, res) {
    if (err) return cb(err)
    debug('got user id %s for username %s', data.id_str, username)
    cb(null, data.id_str)
  })
}

Tweetcat.prototype._handshake = function (cb) {
  debug('preparing handshake...')
  this._sendTweet(util.format(handshakeTmpl, this._remote, Date.now()), cb)
}

Tweetcat.prototype._sendTweet = function (msg, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  opts.status = msg
  debug('tweeting...', opts)
  this._twit.post('statuses/update', opts, function (err, data, res) {
    if (err) return cb(err)
    debug('tweet sent successfully (id: %s)', data.id_str)
    this._lastMsgId = data.id_str
    cb(null, data.id_str)
  }.bind(this))
}
