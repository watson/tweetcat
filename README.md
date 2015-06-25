# tweetcat

**WIP - This is highly experimental!**

p2p pipe across the internet using Twitter as a transport stream.

## Installation

```
npm install -g tweetcat
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

- [x] ~~Allow transfer of binary data~~
- [x] ~~Allow transfer of data larger than 140 chars~~
- [x] ~~Find solution to distributing Twitter API consumer key/secret~~
- [x] ~~Implement two-way handshake so that one side of the conversation
  doesn't start sending before the other is listening~~

## License

MIT
