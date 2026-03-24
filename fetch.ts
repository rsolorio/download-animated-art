/// <reference types="node" />

import { readFileSync, existsSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { IArguments, IM3u8Manifest, IM3uPlaylist, IResourceAttributes, IResourceData, IResourceInfo, ISearchData, ResourceType, VideoShape } from './interfaces';
import { Parser } from 'm3u8-parser';
import { printTable } from 'console-table-printer';
import { buildPath, createDirectory, httpGet, runCommand } from './utilities';
import { RequestOptions } from 'https';

const tokenFileName = 'token.txt';
const ffmpegFileName = 'ffmpeg.exe';
const videoExtension = '.mp4';
const webpExtension = '.webp';
const webpFileName = 'video' + webpExtension;
const videoFileName = 'video' + videoExtension;
const loopFileName = 'loop' + videoExtension;
const appleApiUrl = 'https://amp-api.music.apple.com/v1/catalog';
/** A random album url from the api to test the token. */
const tokenCheckUrl = buildApiUrl('in', ResourceType.Album, '1551901062');
const appleRequestOrigin = 'https://music.apple.com';
/** Just a random album url from the main site to get the token. */
const tokenRetrieveUrl = appleRequestOrigin + '/us/album/positions-deluxe/1553944254';
const tokenStart = 'eyJhbGc';
const animatedFolder = 'animated';
let token = '';

(async () => {
  try {
    await main();
  }
  catch (err) {
    console.log(err);
  }
})();

async function main() {
  const args = getArgs();
  await downloadAnimatedArt(args.url, args.shape, args.loops);
}

async function downloadAnimatedArt(url: string, shape: string, loops: number) {
  const resourceInfo = getResourceInfo(url);
  createDirectory(animatedFolder);

  switch (resourceInfo.type) {
    case ResourceType.Album:
      await downloadAlbumVideo(resourceInfo.id, resourceInfo.country, shape, loops);
      break;
    case ResourceType.Artist:
      await downloadArtistVideo(resourceInfo.id, resourceInfo.country, shape, loops);
      break;
    case ResourceType.Playlist:
      await downloadPlaylistVideo(resourceInfo.id, resourceInfo.country, shape, loops);
      break;
  } 
}

async function setupToken(): Promise<void> {
  let isTokenValid = false;
  const tokenFilePath = buildPath(tokenFileName);
  if (existsSync(tokenFilePath)) {
    const fileBuffer = readFileSync(tokenFilePath);
    const fileToken = fileBuffer.toString();
    if (fileToken) {
      token = fileToken;
      const tokenCheckResponse = await httpGet(tokenCheckUrl, buildApiOptions());
      if (tokenCheckResponse.statusCode === 200) {
        isTokenValid = true;
        console.log('File token valid.');
      }
      else {
        console.log('File token invalid.');
      }
    }
  }

  if (!isTokenValid) {
    token = await retrieveToken();
    writeFileSync(tokenFilePath, token);
    console.log('Token updated.');
  }
}

async function retrieveToken(): Promise<string> {
  const tokenRetrieveResponse = await httpGet(tokenRetrieveUrl, {});
  const crossOriginRegExp = new RegExp('crossorigin src="(/assets/index.+?\.js)"', 'g');
  const crossOriginRegExpResult = tokenRetrieveResponse.text.match(crossOriginRegExp)[0] as string;
  const crossOriginJsPath = crossOriginRegExpResult.replace('crossorigin src="', '').replace('"', '');
  const crossOriginJsResponse = await httpGet(appleRequestOrigin + crossOriginJsPath, {});
  const tokenRegExp = new RegExp(`(${tokenStart}.+?)"`);
  const tokenRegExpResult = crossOriginJsResponse.text.match(tokenRegExp)[0] as string;
  return tokenRegExpResult.replace('"', '');
}

function getArgs(): IArguments {
  return {
    shape: process.argv[2],
    loops: parseInt(process.argv[3], 10),
    url: process.argv[4]
  };
}

function getResourceInfo(url: string): IResourceInfo {
  const splitResult = url.split('/');
  return {
    id: splitResult[6],
    name: splitResult[5],
    type: splitResult[4],
    country: splitResult[3]
  };
}

async function downloadAlbumVideo(resourceId: string, country: string, shape: string, loops: number): Promise<void> {
  await downloadVideo(resourceId, ResourceType.Album, country, shape, loops,
    attributes => {
      return `${attributes.artistName} - ${attributes.name} (${attributes.releaseDate.substring(0, 4)})`;
    }
  );
}

async function downloadArtistVideo(resourceId: string, country: string, shape: string, loops: number): Promise<void> {
  await downloadVideo(resourceId, ResourceType.Artist, country, shape, loops,
    attributes => {
      return attributes.name;
    }
  );
}

async function downloadPlaylistVideo(resourceId: string, country: string, shape: string, loops: number): Promise<void> {
  await downloadVideo(resourceId, ResourceType.Playlist, country, shape, loops,
    attributes => {
      return `${attributes.name} (${attributes.lastModifiedDate.substring(0, 4)})`;
    }
  );
}

async function downloadVideo(
  resourceId: string,
  resourceType: ResourceType,
  country: string,
  shape: string,
  loops: number,
  getFileNameFn: (attributes: IResourceAttributes) => string,
  useBestQuality?: boolean
): Promise<void> {
  // Get resource data to create file name
  const url = buildApiUrl(country, resourceType, resourceId);
  await setupToken();
  const resourceResponse = await httpGet(url, buildApiOptions());
  const resourceData = JSON.parse(resourceResponse.text) as IResourceData;
  const attributes = resourceData.data[0].attributes;
  const name = getFileNameFn(attributes);
  const sanitize = require('sanitize-filename');
  const finalVideoName = sanitize(name) + videoExtension;
  const finalVideoPath = buildPath(animatedFolder, finalVideoName);

  if (existsSync(finalVideoPath)) {
    //console.log('Video already exists: ' + finalVideoPath);
    return;
  }

  // Use resource data to retrieve and display video options
  const m3u8 = getM3u8(resourceData, shape, resourceType);
  const videoResponse = await httpGet(m3u8, {});
  const parser = new Parser();
  parser.push(videoResponse.text);
  parser.end();
  const manifest = parser.manifest as IM3u8Manifest;
  printPlaylistTable(manifest.playlists);

  let selectionId: string;
  let uri: string;
  if (useBestQuality) {
    uri = manifest.playlists[manifest.playlists.length - 1].uri;
  }
  else {
    // Prompt user for the video option
    const readlineSync = require('readline-sync');
    selectionId = readlineSync.question('Enter Id: ');
    uri = manifest.playlists[parseInt(selectionId, 10)].uri;
  }

  // Download the video
  const ffmpegPath = buildPath(ffmpegFileName);
  console.log('Downloading video for: ' + finalVideoPath);
  const videoPath = buildPath(videoFileName);
  const createVideoCommand = `-loglevel quiet -y -i ${uri} -c copy "${videoPath}"`;
  await runCommand(`"${ffmpegPath}" ${createVideoCommand}`);

  // Add loops if needed
  if (loops) {
    console.log('Adding video loops...');
    const loopPath = buildPath(loopFileName);
    const loopVideoCommand = `-loglevel quiet -y -stream_loop ${loops} -i ${videoFileName} -c copy "${loopPath}"`;
    await runCommand(`"${ffmpegPath}" ${loopVideoCommand}`);
    renameSync(loopPath, finalVideoPath);
    unlinkSync(videoPath);
  }
  else {
    renameSync(videoPath, finalVideoPath);
  }

  // CREATE WEBP VERSION
  const webpPath = buildPath(webpFileName);
  // -vcodec libwebp: specifies the WebP encoder
  // -loop 0: 0=loops forever, 1=plays once
  // -an: removes audio
  // -filter:v fps=fps=20: sets the framerate
  // -compression_level 6: 0-6, 6 is slowest/best compression
  // -q:v 70: sets quality (0-100), higher is better
  //const webpCommand = `-i "${finalVideoPath}" -vcodec libwebp -filter:v fps=20 -lossless 0 -q:v 70 -loop 0 -an -vsync 0 ${webpPath}`;
  const webpCommand = `-i "${finalVideoPath}" -vcodec libwebp -filter:v fps=20 -lossless 0 -q:v 70 -loop 0 -an -fps_mode passthrough -compression_level 6 -s 600x600 ${webpPath}`;
  console.log('Converting to webp...');
  try {
    await runCommand(`"${ffmpegPath}" ${webpCommand}`);
  }
  catch(err) {
    console.log('Error');
    console.log(err);
  }
  const finalWebpName = sanitize(name) + webpExtension;
  const finalWebpPath = buildPath(animatedFolder, finalWebpName);
  console.log(`Moving from ${webpPath} to ${finalWebpPath}`);
  renameSync(webpPath, finalWebpPath);

  console.log('Video ready for: ' + finalVideoPath);
}

function printPlaylistTable(playlists: IM3uPlaylist[]): void {
  const rows: any[] = [];

  for (const playlist of playlists) {
    rows.push({
      Id: rows.length,
      Resolution: `${playlist.attributes.RESOLUTION.height}x${playlist.attributes.RESOLUTION.width}`,
      Bitrate: `${Math.round(playlist.attributes.BANDWIDTH / 10000) / 100} Mb/s`,
      Codec: playlist.attributes.CODECS.substring(0, 4),
      Fps: playlist.attributes['FRAME-RATE']
    });
  }
  printTable(rows);
}

function getM3u8(resourceData: IResourceData, shape: string, type: ResourceType): string {
  const video = resourceData.data[0].attributes.editorialVideo;
  if (shape === VideoShape.Tall) {
    if (type === ResourceType.Artist) {
      if (video?.motionArtistFullscreen16x9?.video) {
        return video.motionArtistFullscreen16x9.video
      }
      return video.motionArtistWide16x9.video;
    }
    return video.motionDetailTall.video;
  }

  if (shape === VideoShape.Square) {
    if (type === ResourceType.Artist) {
      if (video?.motionArtistSquare1x1?.video) {
        return video.motionArtistSquare1x1.video;
      }
      return video.motionDetailSquare.video;
    }
    return video.motionSquareVideo1x1.video;
  }

  throw new Error('Unhandled video shape: ' + shape);
}

async function hasAnimatedArt(artistName: string, albumName: string): Promise<boolean> {
  await setupToken();
  const searchUrl = buildSearchUrl('us', ResourceType.Album, albumName + ' ' + artistName);
  const searchResponse = await httpGet(searchUrl, buildApiOptions());
  const searchData = JSON.parse(searchResponse.text) as ISearchData;
  if (searchData?.results?.albums?.data?.length) {
    const album = searchData.results.albums.data[0];
    console.log(album.attributes);
    if (album?.attributes?.editorialVideo?.motionSquareVideo1x1?.video) {
      return true;
    }
  }
  return false;
}

function buildApiUrl(country: string, type: string, id: string): string {
  return `${appleApiUrl}/${country}/${type}s/${id}?extend=editorialVideo`;
}

function buildSearchUrl(country: string, type: string, term: string): string {
  return `${appleApiUrl}/${country}/search?types=${type}s&term=${encodeURIComponent(term)}&extend=editorialVideo`;
}

function buildApiOptions(): RequestOptions {
 return { headers: { authorization: 'Bearer ' + token, origin: appleRequestOrigin } }; 
}

async function downloadFromJson(): Promise<void> {
  const fileBuffer = readFileSync('animatedUrls.json');
  const fileText = fileBuffer.toString();
  const obj = JSON.parse(fileText);
  for (const albumMetadata of obj) {
    if (albumMetadata.hasAnimatedArt) {
      await downloadAnimatedArt(albumMetadata.url, 'square', 0);
    }
    else {
      console.log(albumMetadata);
    }
  }
}