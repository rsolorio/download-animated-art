# Animated Album Art Downloader
Script for downloading animated album art from Apple Music.

This is fully based on this python script called [Fetcher](https://github.com/bunnykek/Fetcher) but reimplemented with node/typescript just for fun.

## Setup
- Install [NodeJs](https://nodejs.org/en)
- Install dependencies by running the following command

      npm install

- Download FFmpeg binary for your OS from [here](https://ffbinaries.com/downloads) and place it under the main project folder.

## Instructions
This is the command syntax:

    npm run fetch [shape] [loops] [url]

Once you run it you will be prompted to select the video resolution of your preference.

The video will be saved under the `animated` folder.

### Arguments
- shape
  - square, tall
  - The shape of the animation
- loops
  - integer
  - Number of times to loop the animation
- url
  - string
  - The apple music url

### Example

    npm run fetch 2 square https://music.apple.com/us/album/coco-original-motion-picture-soundtrack/1440671241

### More Animated Albums
    https://music.apple.com/us/album/one-of-the-boys/715891425
    https://music.apple.com/us/album/thriller/269572838
    https://music.apple.com/us/album/americana/1440880887
    https://music.apple.com/us/album/american-idiot-deluxe-edition/207192731
    https://music.apple.com/us/album/cracker-island/1641561652
