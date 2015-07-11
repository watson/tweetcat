# tweetcat

**WIP - This is highly experimental!**

p2p pipe across the internet using Twitter as a transport stream.

## Installation

```
npm install -g tweetcat
```

## Setup

Before you can use tweetcat you need to create an app on Twitter. Follow
the steps below to get started (you need to have a phone number
associated with your Twitter account).

1. [Create a new app](https://apps.twitter.com/app/new)
  1. Choose a unique name, e.g. `tweetcat-<github-username>`
  1. Put in a dummy website, e.g. `http://example.com`
  1. Leave Callback URL blank
1. When the application have been created you should be taken to the app
   page. From here, click 'Keys and Access Token' and note the 'Consumer
   Key' and the 'Consumer Secret'

When you've successfully created the Twitter app, continue with
initialization:

```
tweetcat --init
```

## Usage

```
tweetcat [username]
```

Where `username` is a Twitter user (without the `@`).

## Todo's

- [ ] Add tests
- [x] ~~Allow transfer of binary data~~
- [x] ~~Allow transfer of data larger than 140 chars~~
- [x] ~~Find solution to distributing Twitter API consumer key/secret~~
- [x] ~~Implement two-way handshake so that one side of the conversation
  doesn't start sending before the other is listening~~

## License

MIT
