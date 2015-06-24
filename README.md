# tweetcat

WIP - This is highly experimental!

p2p pipe across the internet using Twitter as a transport stream.

## Installation

```
npm install -g watson/tweetcat
```

## Usage

First initialize:

```
tweetcat --init
```

Then run:

```
tweetcat [username]
```

Where `username` is a Twitter user (without the `@`).

## Todo's

- [ ] Allow transfer of binary data
- [x] Implement two-way handshake so that one side of the conversation
  doesn't start sending before the other is listening

## License

MIT
